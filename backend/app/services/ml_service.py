"""
ML serving layer for RazorGuard.

Loads the verified Phase 2 artifacts (Random Forest model, FeatureEngineer
preprocessor, metadata) once and exposes a clean prediction interface to
the API layer.

Serving semantics:

- The engineered velocity/expanding-window features depend on a customer's
  historical transactions.
- Each scoring request builds a temporary per-customer context:
      [historical rows BEFORE the new transaction] + [new transaction]
- Future transactions are NEVER included in the scoring context.
  This prevents look-ahead/data leakage during inference.
- The baseline history loaded from data/transactions.csv is READ-ONLY.
  Scored requests never permanently mutate shared in-memory state, so
  concurrent requests cannot corrupt each other's feature context.
- All timestamps are normalized to timezone-aware UTC before concatenation,
  so naive CSV timestamps and tz-aware ISO request timestamps can be sorted
  together safely.

The fraud probability comes from the actual serialized model. Human-readable
risk signals are derived separately from real feature values; they are NOT
claimed to be the model's explanation.

The locked decision threshold (0.30) lives in model_metadata.json and is
never modified here.
"""

import hashlib
import json
import logging
import os
import re
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import joblib
import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Risk severity boundaries (reporting only).
#
# NOTE:
# These are deliberately separate from the model's decision threshold.
# The model threshold comes from metadata["selected_threshold"].
# ---------------------------------------------------------------------------
RISK_MEDIUM_BOUNDARY = 0.60
RISK_HIGH_BOUNDARY = 0.85

REQUIRED_ARTIFACTS = (
    "model.joblib",
    "preprocessor.joblib",
    "model_metadata.json",
)


class MLServiceUnavailable(RuntimeError):
    """Raised when ML artifacts are missing/corrupted or not loaded."""


class PredictionError(RuntimeError):
    """Raised when preprocessing or inference fails for a specific request."""


# ---------------------------------------------------------------------------
# Path resolution
# ---------------------------------------------------------------------------

def _candidate_roots() -> List[Path]:
    """
    Return possible project roots.

    ml_service.py is located at:

        <repo>/backend/app/services/ml_service.py

    during local development and typically at:

        /app/app/services/ml_service.py

    inside Docker.
    """
    here = Path(__file__).resolve()

    return [
        here.parent.parent.parent.parent,  # repo root
        here.parent.parent.parent,         # /app or backend/
        Path.cwd(),
        Path.cwd() / "backend",
        Path("/app"),
    ]


def resolve_artifacts_dir() -> Path:
    """Locate the ML artifacts directory."""
    env_dir = os.environ.get("ML_ARTIFACTS_DIR")

    if env_dir:
        return Path(env_dir)

    for root in _candidate_roots():
        artifacts = root / "ml" / "artifacts"

        if all(
            (artifacts / name).exists()
            for name in REQUIRED_ARTIFACTS
        ):
            logger.info("Located ML artifacts at: %s", artifacts)
            return artifacts

    raise FileNotFoundError(
        "ML artifacts could not be located. Expected a directory containing "
        f"{', '.join(REQUIRED_ARTIFACTS)}. "
        "Set ML_ARTIFACTS_DIR to override."
    )


def resolve_history_path(artifacts_dir: Path) -> Path:
    """Locate the baseline transaction history CSV."""
    env_path = os.environ.get("ML_HISTORY_PATH")

    if env_path:
        return Path(env_path)

    return artifacts_dir.parent.parent / "data" / "transactions.csv"


def _slugify(name: str) -> str:
    """Convert a model name into a stable identifier-safe slug."""
    return re.sub(
        r"[^a-z0-9]+",
        "_",
        name.lower(),
    ).strip("_")


def compute_model_version(
    model_name: str,
    model_file: Path,
) -> str:
    """
    Create a deterministic model artifact identifier.

    Format:

        <slug>-<sha256[:12]>

    The hash is calculated from the actual serialized model file.
    """
    digest = hashlib.sha256(
        model_file.read_bytes()
    ).hexdigest()[:12]

    return f"{_slugify(model_name)}-{digest}"


# ---------------------------------------------------------------------------
# Risk classification
# ---------------------------------------------------------------------------

def classify_risk(
    probability: float,
    threshold: float,
) -> Tuple[str, str]:
    """
    Map fraud probability to:

        (risk_level, decision)

    Severity bands:

        LOW       < threshold
        MEDIUM    threshold <= p < 0.60
        HIGH      0.60 <= p < 0.85
        CRITICAL  >= 0.85

    The threshold is read from model metadata.

    Decisions are defensive only:
    nothing is automatically declined.
    """
    if probability < threshold:
        return "LOW", "ALLOW"

    elif probability < RISK_MEDIUM_BOUNDARY:
        return "MEDIUM", "MONITOR"

    elif probability < RISK_HIGH_BOUNDARY:
        return "HIGH", "REVIEW"

    else:
        return "CRITICAL", "REVIEW"


# ---------------------------------------------------------------------------
# Timestamp normalization
# ---------------------------------------------------------------------------

def normalize_timestamp(value: Any) -> pd.Timestamp:
    """
    Normalize a parseable timestamp to timezone-aware UTC.

    Naive timestamps are interpreted as UTC.
    Timezone-aware timestamps are converted to UTC.

    This guarantees pandas comparisons/sorting do not mix
    timezone-naive and timezone-aware values.
    """
    ts = pd.to_datetime(value)

    if ts.tzinfo is None:
        return ts.tz_localize("UTC")

    return ts.tz_convert("UTC")


# ---------------------------------------------------------------------------
# Human-readable risk signals
# ---------------------------------------------------------------------------

def derive_risk_signals(
    raw_features: pd.Series,
) -> List[str]:
    """
    Derive human-readable observations from actual feature values.

    These are independent observations about the transaction.
    They are NOT claimed to be the model's explanation.
    """
    signals: List[str] = []

    def flag(
        column: str,
        expected: Any,
    ) -> bool:
        value = raw_features.get(column, None)

        if value is None or pd.isna(value):
            return False

        try:
            return bool(int(value) == expected)
        except (TypeError, ValueError):
            return False

    def number(
        column: str,
        default: float = 0.0,
    ) -> float:
        value = raw_features.get(
            column,
            default,
        )

        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    if number("failed_attempts") > 0:
        signals.append("Multiple recent failures")

    if flag("new_device", 1):
        signals.append("New device")

    if flag("unusual_country", 1):
        signals.append("Unusual country")

    if flag("country_change", 1):
        signals.append("Country changed")

    if flag("payment_method_change", 1):
        signals.append("Payment method changed")

    if number("transactions_last_5m") >= 2:
        signals.append(
            "High transaction velocity (last 5 minutes)"
        )

    if number("transactions_last_1h") >= 4:
        signals.append(
            "High transaction velocity (last hour)"
        )

    if flag("unusual_transaction_hour", 1):
        signals.append(
            "Unusual transaction hour (00:00-05:59)"
        )

    if number(
        "amount_vs_customer_average",
        1.0,
    ) > 3.0:
        signals.append(
            "Amount significantly above historical average"
        )

    return signals


# ---------------------------------------------------------------------------
# Prediction result
# ---------------------------------------------------------------------------

class RiskPrediction:
    def __init__(
        self,
        transaction_id: str,
        fraud_probability: float,
        risk_level: str,
        threshold: float,
        decision: str,
        risk_signals: List[str],
        model_version: str,
        scored_at: datetime,
    ):
        self.transaction_id = transaction_id
        self.fraud_probability = fraud_probability
        self.risk_level = risk_level
        self.threshold = threshold
        self.decision = decision
        self.risk_signals = risk_signals
        self.model_version = model_version
        self.scored_at = scored_at

    def to_dict(self) -> Dict[str, Any]:
        return {
            "transaction_id": self.transaction_id,
            "fraud_probability": self.fraud_probability,
            "risk_level": self.risk_level,
            "threshold": self.threshold,
            "decision": self.decision,
            "risk_signals": self.risk_signals,
            "model_version": self.model_version,
            "scored_at": self.scored_at.isoformat(),
        }


# ---------------------------------------------------------------------------
# ML Service
# ---------------------------------------------------------------------------

class MLService:
    """
    Loads and serves the verified Random Forest fraud detector.

    Thread-safety:

      - load_artifacts()/ensure_loaded() are guarded by a lock.
      - Loading is idempotent.
      - After loading, prediction only READS shared state.
      - Per-request DataFrames are local.
      - Baseline history is never mutated.
      - Future baseline transactions are excluded from scoring context.
    """

    def __init__(
        self,
        artifacts_dir: Optional[Path] = None,
        history_path: Optional[Path] = None,
    ):
        self.model = None
        self.preprocessor = None
        self.metadata: Optional[Dict[str, Any]] = None
        self.df_history: Optional[pd.DataFrame] = None
        self.model_version: Optional[str] = None
        self.initialized = False

        self._artifacts_dir_override = (
            Path(artifacts_dir)
            if artifacts_dir
            else None
        )

        self._history_path_override = (
            Path(history_path)
            if history_path
            else None
        )

        # RLock is required because ensure_loaded()
        # can delegate to load_artifacts().
        self._load_lock = threading.RLock()

    # -----------------------------------------------------------------------
    # Lifecycle
    # -----------------------------------------------------------------------

    @property
    def is_ready(self) -> bool:
        return self.initialized

    @property
    def artifacts_dir(self) -> Optional[Path]:
        return self._artifacts_dir_override

    def ensure_loaded(self) -> None:
        """
        Lazy, thread-safe, idempotent ML artifact loading.
        """
        if self.initialized:
            return

        with self._load_lock:
            if self.initialized:
                return

            try:
                self.load_artifacts()

            except MLServiceUnavailable:
                raise

            except Exception as exc:
                logger.error(
                    "ML artifacts unavailable: %s",
                    exc,
                )
                raise MLServiceUnavailable(
                    str(exc)
                ) from exc

    def load_artifacts(self) -> None:
        """
        Load model, preprocessor and metadata from disk.

        This method NEVER trains a model.
        """
        with self._load_lock:
            logger.info("Loading ML artifacts...")

            artifacts_dir = (
                self._artifacts_dir_override
                or resolve_artifacts_dir()
            )

            paths = {
                name: artifacts_dir / name
                for name in REQUIRED_ARTIFACTS
            }

            missing = [
                name
                for name, path in paths.items()
                if not path.exists()
            ]

            if missing:
                raise FileNotFoundError(
                    f"Missing required ML artifact(s): "
                    f"{', '.join(missing)} "
                    f"(looked in {artifacts_dir})"
                )

            # The serialized FeatureEngineer references ml.features.
            # Make the directory containing the ml package importable.
            ml_parent = str(
                artifacts_dir.parent.parent
            )

            if ml_parent not in sys.path:
                sys.path.insert(
                    0,
                    ml_parent,
                )

            try:
                metadata = json.loads(
                    paths["model_metadata.json"].read_text(
                        encoding="utf-8"
                    )
                )

                if (
                    "selected_threshold" not in metadata
                    or "features" not in metadata
                ):
                    raise ValueError(
                        "model_metadata.json is missing required keys "
                        "('selected_threshold', 'features')"
                    )

                preprocessor = joblib.load(
                    paths["preprocessor.joblib"]
                )

                model = joblib.load(
                    paths["model.joblib"]
                )

                if not hasattr(
                    preprocessor,
                    "transform",
                ):
                    raise ValueError(
                        "preprocessor.joblib does not expose transform()"
                    )

                if not hasattr(
                    model,
                    "predict_proba",
                ):
                    raise ValueError(
                        "model.joblib does not expose predict_proba()"
                    )

            except Exception as exc:
                logger.exception(
                    "Failed to load serialized ML artifacts."
                )

                raise RuntimeError(
                    f"Failed to load ML artifacts: {exc}"
                ) from exc

            history = self._load_history(
                self._history_path_override
                or resolve_history_path(artifacts_dir)
            )

            self.metadata = metadata
            self.preprocessor = preprocessor
            self.model = model
            self.df_history = history

            self.model_version = compute_model_version(
                str(
                    metadata.get(
                        "model_name",
                        "unknown_model",
                    )
                ),
                paths["model.joblib"],
            )

            self.initialized = True

            logger.info(
                "ML service ready "
                "(model=%s, version=%s, threshold=%s, history_rows=%s)",
                metadata.get("model_name"),
                self.model_version,
                metadata.get("selected_threshold"),
                0 if history is None else len(history),
            )

    # -----------------------------------------------------------------------
    # History loading
    # -----------------------------------------------------------------------

    @staticmethod
    def _load_history(
        history_path: Path,
    ) -> pd.DataFrame:
        """
        Load baseline history as read-only scoring context.

        Timestamp values are normalized to UTC immediately.
        """
        if not history_path.exists():
            logger.warning(
                "History CSV not found at %s; "
                "serving with empty context.",
                history_path,
            )

            return pd.DataFrame()

        df = pd.read_csv(history_path)

        if "timestamp" not in df.columns:
            raise ValueError(
                "History CSV must contain a 'timestamp' column."
            )

        if "customer_id" not in df.columns:
            raise ValueError(
                "History CSV must contain a 'customer_id' column."
            )

        df["timestamp"] = pd.to_datetime(
            df["timestamp"],
            utc=True,
        )

        return (
            df.sort_values("timestamp")
            .reset_index(drop=True)
        )

    # -----------------------------------------------------------------------
    # Introspection
    # -----------------------------------------------------------------------

    def describe(self) -> Dict[str, Any]:
        """
        Return non-sensitive ML service status information.
        """
        metadata = self.metadata or {}

        model_type = None

        if self.model is not None:
            inner = getattr(
                self.model,
                "model",
                None,
            )

            model_type = (
                type(inner).__name__
                if inner is not None
                else type(self.model).__name__
            )

        return {
            "status": (
                "ready"
                if self.initialized
                else "unavailable"
            ),
            "model_name": metadata.get(
                "model_name"
            ),
            "model_type": model_type,
            "threshold": metadata.get(
                "selected_threshold"
            ),
            "feature_count": len(
                metadata.get(
                    "features",
                    [],
                )
            ),
            "model_version": self.model_version,
        }

    def held_out_metrics(self) -> Dict[str, Any]:
        """
        Return stored held-out evaluation metrics.

        Metrics are read from metadata and are not recomputed here.
        """
        m = (
            self.metadata or {}
        ).get(
            "held_out_test_metrics"
        ) or {}

        return {
            "label": (
                "Held-out test metrics on synthetic data"
            ),
            "note": (
                "Computed once on the untouched held-out split "
                "of the synthetic training dataset. "
                "Not live production performance."
            ),
            "precision": m.get("precision"),
            "recall": m.get("recall"),
            "f1": m.get("f1"),
            "roc_auc": m.get("roc_auc"),
            "pr_auc": m.get("pr_auc"),
            "true_positive": m.get("tp"),
            "true_negative": m.get("tn"),
            "false_positive": m.get("fp"),
            "false_negative": m.get("fn"),
            "false_positive_cost": m.get("fp_cost"),
            "false_negative_cost": m.get("fn_cost"),
            "total_expected_loss": m.get("total_cost"),
            "threshold": m.get(
                "threshold",
                (
                    self.metadata or {}
                ).get("selected_threshold"),
            ),
        }

    # -----------------------------------------------------------------------
    # Prediction
    # -----------------------------------------------------------------------

    def predict(
        self,
        transaction: Dict[str, Any],
    ) -> RiskPrediction:
        """
        Score one transaction using the saved preprocessor + model.

        IMPORTANT:

        Only transactions occurring BEFORE the transaction being scored
        are included in the customer's historical context.

        This prevents future-data leakage during inference.
        """
        self.ensure_loaded()

        try:
            return self._predict(transaction)

        except (
            MLServiceUnavailable,
            PredictionError,
        ):
            raise

        except Exception as exc:
            logger.exception(
                "Prediction scoring failure."
            )

            raise PredictionError(
                f"Failed to score transaction: {exc}"
            ) from exc

    def _predict(
        self,
        transaction: Dict[str, Any],
    ) -> RiskPrediction:
        """
        Internal prediction implementation.

        The scoring transaction is always the final row in the context.
        """

        tx = dict(transaction)

        scored_at = datetime.now(
            timezone.utc
        )

        # ---------------------------------------------------------------
        # Build the new transaction row.
        # ---------------------------------------------------------------

        df_tx = pd.DataFrame([tx])

        scoring_timestamp = normalize_timestamp(
            tx["timestamp"]
        )

        df_tx["timestamp"] = [
            scoring_timestamp
        ]

        customer_id = tx.get(
            "customer_id"
        )

        baseline = self.df_history

        # ---------------------------------------------------------------
        # IMPORTANT LEAKAGE FIX
        #
        # Only historical transactions strictly BEFORE the transaction
        # being scored may be used to engineer historical features.
        #
        # Previously this code selected ALL rows for the customer:
        #
        #   baseline["customer_id"] == customer_id
        #
        # That allowed future transactions to influence the prediction.
        # ---------------------------------------------------------------

        if (
            customer_id is not None
            and baseline is not None
            and not baseline.empty
            and "customer_id" in baseline.columns
            and "timestamp" in baseline.columns
        ):
            customer_rows = baseline.loc[
                (baseline["customer_id"] == customer_id)
                & (
                    baseline["timestamp"]
                    < scoring_timestamp
                )
            ].copy()

            context = pd.concat(
                [
                    customer_rows,
                    df_tx,
                ],
                ignore_index=True,
            )

        else:
            context = df_tx.copy()

        # ---------------------------------------------------------------
        # Guarantee chronological order and guarantee that the scoring
        # transaction is the final row.
        #
        # This is defensive: even though future rows are already removed,
        # explicitly sorting here makes the invariant obvious.
        # ---------------------------------------------------------------

        context["timestamp"] = pd.to_datetime(
            context["timestamp"],
            utc=True,
        )

        context = (
            context.sort_values(
                "timestamp",
                kind="mergesort",
            )
            .reset_index(drop=True)
        )

        # If duplicate timestamps exist, explicitly locate the newly
        # scored transaction and make sure it is the final row.
        #
        # The scoring transaction is the only row we just created, so
        # using transaction_id is the safest identifier.
        transaction_id = str(
            tx.get("transaction_id")
        )

        matching_rows = context.index[
            context["transaction_id"].astype(str)
            == transaction_id
        ]

        if len(matching_rows) != 1:
            raise PredictionError(
                "Scoring transaction could not be uniquely located "
                "in the prediction context."
            )

        scoring_index = matching_rows[0]

        if scoring_index != len(context) - 1:
            scoring_row = context.loc[
                [scoring_index]
            ]

            historical_rows = context.drop(
                index=scoring_index
            )

            context = pd.concat(
                [
                    historical_rows,
                    scoring_row,
                ],
                ignore_index=True,
            )

        # ---------------------------------------------------------------
        # Transform using the exact fitted FeatureEngineer.
        # ---------------------------------------------------------------

        features = self.preprocessor.transform(
            context
        )

        # The scoring transaction is guaranteed to be the last row.
        probability = float(
            self.model.predict_proba(
                features.iloc[[-1]]
            )[0]
        )

        # ---------------------------------------------------------------
        # Round first so probability and classification remain consistent.
        # ---------------------------------------------------------------

        probability_rounded = round(
            probability,
            4,
        )

        threshold = float(
            self.metadata[
                "selected_threshold"
            ]
        )

        risk_level, decision = classify_risk(
            probability_rounded,
            threshold,
        )

        # ---------------------------------------------------------------
        # Human-readable risk signals.
        #
        # These come from actual engineered feature values.
        # They are NOT model explanations.
        # ---------------------------------------------------------------

        raw_features = (
            self.preprocessor
            ._create_raw_features(context)
        )

        raw_last = raw_features.iloc[-1]

        risk_signals = derive_risk_signals(
            raw_last
        )

        return RiskPrediction(
            transaction_id=transaction_id,
            fraud_probability=probability_rounded,
            risk_level=risk_level,
            threshold=threshold,
            decision=decision,
            risk_signals=risk_signals,
            model_version=self.model_version,
            scored_at=scored_at,
        )


# ---------------------------------------------------------------------------
# Module-level default service
# ---------------------------------------------------------------------------

_default_service: Optional[MLService] = None
_default_service_lock = threading.Lock()


def get_default_service() -> MLService:
    """
    Return the singleton MLService instance.
    """
    global _default_service

    if _default_service is None:
        with _default_service_lock:
            if _default_service is None:
                _default_service = MLService()

    return _default_service


# Convenience alias.
ml_service = get_default_service()