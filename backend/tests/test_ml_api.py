"""
Phase 3 tests — ML service layer, transaction scoring API, persistence,
audit logging, RBAC and ML endpoints.
"""

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.audit import AuditLog
from app.models.transaction import Transaction
from app.services.ml_service import (
    MLService,
    classify_risk,
    get_default_service,
    normalize_timestamp,
)

ARTIFACTS_DIR = Path(__file__).resolve().parent.parent.parent / "ml" / "artifacts"
METADATA_PATH = ARTIFACTS_DIR / "model_metadata.json"


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------
def make_payload(**overrides) -> dict:
    """Deterministic demo transaction (mirrors ml/predict.py demo scenario)."""
    payload = {
        "transaction_id": f"TXN_{uuid.uuid4().hex[:12].upper()}",
        "customer_id": "CUST_0042",
        "merchant_id": "MERCH_0010",
        "amount": 240000.0,
        "currency": "INR",
        "timestamp": "2026-08-24T19:20:42Z",
        "payment_method": "card",
        "device_id": "DEV_NEW_IP_XYZ",
        "country": "US",
        "ip_region": "REG_12",
        "customer_account_age": 45,
        "historical_transaction_count": 12,
        "historical_failure_count": 0,
        "failed_attempts": 3,
        "new_device": 1,
        "unusual_country": 1,
        "payment_method_change": 1,
    }
    payload.update(overrides)
    return payload


@pytest.fixture(scope="module")
def fresh_service() -> MLService:
    """A dedicated MLService instance loaded from the verified artifacts."""
    service = MLService()
    service.load_artifacts()
    return service


@pytest.fixture
def score_headers(analyst_token):
    return {"Authorization": f"Bearer {analyst_token}"}


def expected_risk(probability: float):
    if probability < 0.30:
        return "LOW", "ALLOW"
    elif probability < 0.60:
        return "MEDIUM", "MONITOR"
    elif probability < 0.85:
        return "HIGH", "REVIEW"
    return "CRITICAL", "REVIEW"


async def post_score(async_client: AsyncClient, headers: dict, payload: dict):
    return await async_client.post(
        "/api/transactions/score", json=payload, headers=headers
    )


# ===========================================================================
# ML service layer
# ===========================================================================
class TestMLService:
    def test_loads_model_preprocessor_metadata(self, fresh_service: MLService):
        assert fresh_service.initialized
        assert fresh_service.model is not None
        assert hasattr(fresh_service.model, "predict_proba")
        assert fresh_service.preprocessor is not None
        assert hasattr(fresh_service.preprocessor, "transform")
        assert isinstance(fresh_service.metadata, dict)

    def test_missing_artifact_raises(self, tmp_path):
        empty_dir = tmp_path / "nowhere"
        empty_dir.mkdir()
        service = MLService(artifacts_dir=empty_dir)
        with pytest.raises(FileNotFoundError):
            service.load_artifacts()
        assert not service.initialized

    def test_corrupted_artifact_raises(self, tmp_path):
        corrupt_dir = tmp_path / "corrupt"
        corrupt_dir.mkdir()
        (corrupt_dir / "model.joblib").write_bytes(b"this is not a joblib file")
        (corrupt_dir / "preprocessor.joblib").write_bytes(b"garbage")
        (corrupt_dir / "model_metadata.json").write_text("{}")
        service = MLService(artifacts_dir=corrupt_dir)
        with pytest.raises(RuntimeError):
            service.load_artifacts()

    def test_metadata_threshold_and_features(self, fresh_service: MLService):
        with open(METADATA_PATH) as f:
            raw = json.load(f)
        assert fresh_service.metadata["selected_threshold"] == 0.30
        assert len(fresh_service.metadata["features"]) == 20
        assert fresh_service.metadata == raw or (
            fresh_service.metadata["selected_threshold"] == raw["selected_threshold"]
            and fresh_service.metadata["features"] == raw["features"]
        )

    def test_locked_threshold_is_0_30(self, fresh_service: MLService):
        assert float(fresh_service.metadata["selected_threshold"]) == pytest.approx(0.30)

    def test_model_version_is_artifact_hash(self, fresh_service: MLService):
        import hashlib

        expected_hash = hashlib.sha256((ARTIFACTS_DIR / "model.joblib").read_bytes()).hexdigest()[:12]
        assert fresh_service.model_version.endswith(expected_hash)
        assert fresh_service.model_version.startswith("random_forest")
        assert "/" not in fresh_service.model_version and "\\" not in fresh_service.model_version

    def test_prediction_works(self, fresh_service: MLService):
        prediction = fresh_service.predict(make_payload())
        assert 0.0 <= prediction.fraud_probability <= 1.0
        assert prediction.threshold == pytest.approx(0.30)
        exp_level, exp_decision = expected_risk(prediction.fraud_probability)
        assert prediction.risk_level == exp_level
        assert prediction.decision == exp_decision
        assert isinstance(prediction.risk_signals, list)
        assert all(isinstance(s, str) for s in prediction.risk_signals)
        assert prediction.scored_at.tzinfo is not None
        assert prediction.model_version == fresh_service.model_version

    def test_timestamp_normalization_consistency(self, fresh_service: MLService):
        """Naive and UTC-aware representations of the same instant must score identically."""
        aware = make_payload(timestamp="2026-08-24T19:20:42Z")
        naive_utc = make_payload(timestamp="2026-08-24T19:20:42")
        offset = make_payload(timestamp="2026-08-24T14:20:42-05:00")

        p1 = fresh_service.predict(aware)
        p2 = fresh_service.predict(naive_utc)
        p3 = fresh_service.predict(offset)
        assert p1.fraud_probability == p2.fraud_probability == p3.fraud_probability

    def test_normalize_timestamp_handles_mixed_tz(self):
        ts_aware = normalize_timestamp("2026-08-24T19:20:42Z")
        ts_naive = normalize_timestamp("2026-08-24T19:20:42")
        assert ts_aware.tzinfo is not None
        assert ts_naive.tzinfo is not None
        df = pd.DataFrame({"timestamp": [ts_aware, ts_naive]}).sort_values("timestamp")
        assert len(df) == 2  # sorting mixed-awareness frames must not raise

    def test_baseline_history_not_mutated_by_predictions(self, fresh_service: MLService):
        baseline = fresh_service.df_history
        snapshot_len = len(baseline)
        snapshot = baseline.copy(deep=True)

        payload = make_payload()
        first = fresh_service.predict(payload)
        second = fresh_service.predict(payload)

        assert len(fresh_service.df_history) == snapshot_len
        assert fresh_service.df_history.equals(snapshot)
        # Repeated identical requests are deterministic
        assert first.fraud_probability == second.fraud_probability
        assert first.risk_level == second.risk_level

    @pytest.mark.parametrize(
        "prob,level,decision",
        [
            (0.29, "LOW", "ALLOW"),
            (0.30, "MEDIUM", "MONITOR"),
            (0.59, "MEDIUM", "MONITOR"),
            (0.60, "HIGH", "REVIEW"),
            (0.8499, "HIGH", "REVIEW"),
            (0.85, "CRITICAL", "REVIEW"),
            (0.99, "CRITICAL", "REVIEW"),
        ],
    )
    def test_classify_risk_boundaries(self, prob, level, decision):
        assert classify_risk(prob, 0.30) == (level, decision)

    def test_artifacts_dir_env_override(self, tmp_path, monkeypatch):
        """Container-style configuration: ML_ARTIFACTS_DIR points at /app/ml/artifacts."""
        fake_app = tmp_path / "app"
        (fake_app / "ml" / "artifacts").mkdir(parents=True)
        for name in ("model.joblib", "preprocessor.joblib"):
            (fake_app / "ml" / "artifacts" / name).write_bytes(b"placeholder")
        (fake_app / "ml" / "artifacts" / "model_metadata.json").write_text("{}")

        monkeypatch.setenv("ML_ARTIFACTS_DIR", str(fake_app / "ml" / "artifacts"))
        service = MLService()
        # Missing metadata keys -> wrapped RuntimeError proves the env path was used
        with pytest.raises(RuntimeError):
            service.load_artifacts()

    def test_history_path_env_override(self, fresh_service: MLService, tmp_path, monkeypatch):
        """ML_HISTORY_PATH lets deployments supply their own baseline context."""
        custom = tmp_path / "history.csv"
        pd.DataFrame(
            {
                "transaction_id": ["TXN_H1"],
                "customer_id": ["CUST_0042"],
                "merchant_id": ["MERCH_0001"],
                "amount": [100.0],
                "currency": ["INR"],
                "timestamp": ["2026-08-01T10:00:00"],
                "payment_method": ["card"],
                "device_id": ["DEV_X"],
                "country": ["IN"],
                "ip_region": ["REG_1"],
                "customer_account_age": [100],
                "historical_transaction_count": [1],
                "historical_failure_count": [0],
                "failed_attempts": [0],
                "new_device": [0],
                "unusual_country": [0],
                "payment_method_change": [0],
                "fraud": [0],
            }
        ).to_csv(custom, index=False)

        loaded = MLService._load_history(custom)
        assert len(loaded) == 1
        assert str(loaded["timestamp"].dt.tz).endswith("UTC")


# ===========================================================================
# Scoring API — RBAC
# ===========================================================================
class TestScoringRBAC:
    @pytest.mark.asyncio
    async def test_admin_can_score(self, async_client: AsyncClient, admin_token: str):
        response = await post_score(
            async_client, {"Authorization": f"Bearer {admin_token}"}, make_payload()
        )
        assert response.status_code == 200
        body = response.json()
        assert 0.0 <= body["fraud_probability"] <= 1.0

    @pytest.mark.asyncio
    async def test_analyst_can_score(self, async_client: AsyncClient, score_headers: dict):
        response = await post_score(async_client, score_headers, make_payload())
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_viewer_cannot_score(self, async_client: AsyncClient, viewer_token: str):
        response = await post_score(
            async_client, {"Authorization": f"Bearer {viewer_token}"}, make_payload()
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_unauthenticated_cannot_score(self, async_client: AsyncClient):
        response = await post_score(async_client, {}, make_payload())
        assert response.status_code in (401, 403)


# ===========================================================================
# Scoring API — validation and contract
# ===========================================================================
class TestScoringContract:
    @pytest.mark.asyncio
    async def test_valid_response_contract(self, async_client: AsyncClient, score_headers: dict):
        response = await post_score(async_client, score_headers, make_payload())
        assert response.status_code == 200
        body = response.json()
        for key in (
            "transaction_id",
            "fraud_probability",
            "risk_level",
            "threshold",
            "decision",
            "risk_signals",
            "model_version",
            "scored_at",
        ):
            assert key in body
        assert body["threshold"] == pytest.approx(0.30)
        assert isinstance(body["risk_signals"], list)
        exp_level, exp_decision = expected_risk(body["fraud_probability"])
        assert body["risk_level"] == exp_level
        assert body["decision"] == exp_decision
        assert body["model_version"]
        # scored_at parses as ISO 8601
        datetime.fromisoformat(body["scored_at"].replace("Z", "+00:00"))

    @pytest.mark.asyncio
    async def test_missing_required_field_422(self, async_client: AsyncClient, score_headers: dict):
        payload = make_payload()
        del payload["amount"]
        response = await post_score(async_client, score_headers, payload)
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_negative_amount_422(self, async_client: AsyncClient, score_headers: dict):
        response = await post_score(
            async_client, score_headers, make_payload(amount=-100.0)
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_malformed_timestamp_422(self, async_client: AsyncClient, score_headers: dict):
        response = await post_score(
            async_client, score_headers, make_payload(timestamp="not-a-timestamp")
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_duplicate_transaction_conflict(self, async_client: AsyncClient, score_headers: dict):
        payload = make_payload()  # same id submitted twice
        first = await post_score(async_client, score_headers, payload)
        assert first.status_code == 200
        second = await post_score(async_client, score_headers, payload)
        assert second.status_code == 409

    @pytest.mark.asyncio
    async def test_ml_unavailable_returns_503(
        self, async_client: AsyncClient, score_headers: dict, monkeypatch, tmp_path
    ):
        service = get_default_service()
        monkeypatch.setattr(service, "initialized", False)
        monkeypatch.setattr(service, "_artifacts_dir_override", tmp_path / "missing")
        response = await post_score(async_client, score_headers, make_payload())
        assert response.status_code == 503


# ===========================================================================
# ML endpoints
# ===========================================================================
class TestMLEndpoints:
    @pytest.mark.asyncio
    async def test_ml_status_ready_for_viewer(
        self, async_client: AsyncClient, viewer_token: str
    ):
        response = await async_client.get(
            "/api/ml/status", headers={"Authorization": f"Bearer {viewer_token}"}
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ready"
        assert body["model_type"] == "RandomForestClassifier"
        assert body["threshold"] == pytest.approx(0.30)
        assert body["feature_count"] == 20
        assert body["model_name"] == "Random Forest"
        assert body["model_version"]

    @pytest.mark.asyncio
    async def test_ml_status_requires_auth(self, async_client: AsyncClient):
        response = await async_client.get("/api/ml/status")
        assert response.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_ml_metrics_match_stored_metadata(
        self, async_client: AsyncClient, viewer_token: str
    ):
        with open(METADATA_PATH) as f:
            stored = json.load(f)["held_out_test_metrics"]

        response = await async_client.get(
            "/api/ml/metrics", headers={"Authorization": f"Bearer {viewer_token}"}
        )
        assert response.status_code == 200
        body = response.json()
        assert body["label"] == "Held-out test metrics on synthetic data"
        assert body["precision"] == pytest.approx(stored["precision"])
        assert body["recall"] == pytest.approx(stored["recall"])
        assert body["f1"] == pytest.approx(stored["f1"])
        assert body["roc_auc"] == pytest.approx(stored["roc_auc"])
        assert body["pr_auc"] == pytest.approx(stored["pr_auc"])
        assert body["true_positive"] == stored["tp"]
        assert body["true_negative"] == stored["tn"]
        assert body["false_positive"] == stored["fp"]
        assert body["false_negative"] == stored["fn"]
        assert body["false_positive_cost"] == pytest.approx(stored["fp_cost"])
        assert body["false_negative_cost"] == pytest.approx(stored["fn_cost"])
        assert body["total_expected_loss"] == pytest.approx(stored["total_cost"])
        assert body["threshold"] == pytest.approx(stored["threshold"])

    @pytest.mark.asyncio
    async def test_health_includes_ml_status(self, async_client: AsyncClient):
        response = await async_client.get("/api/system/health")
        assert response.status_code in (200, 503)
        body = response.json()
        assert "ml_model" in body
        assert body["ml_model"] in ("healthy", "unavailable")
        if body["status"] == "healthy":
            assert body["ml_model"] == "healthy"


# ===========================================================================
# Persistence & audit
# ===========================================================================
class TestPersistenceAndAudit:
    @pytest.mark.asyncio
    async def test_scored_transaction_is_stored(
        self, async_client: AsyncClient, score_headers: dict, db_session
    ):
        payload = make_payload(customer_id=f"CUST_{uuid.uuid4().hex[:6].upper()}")
        response = await post_score(async_client, score_headers, payload)
        assert response.status_code == 200
        body = response.json()

        result = await db_session.execute(
            select(Transaction).where(Transaction.transaction_id == body["transaction_id"])
        )
        txn = result.scalar_one_or_none()
        assert txn is not None
        assert float(txn.amount) == pytest.approx(payload["amount"])
        assert txn.customer_id == payload["customer_id"]
        assert txn.merchant_id == payload["merchant_id"]
        assert txn.currency == payload["currency"]
        assert txn.device_id == payload["device_id"]
        assert txn.payment_method == payload["payment_method"]
        assert txn.country == payload["country"]
        assert float(txn.fraud_probability) == pytest.approx(body["fraud_probability"])
        assert txn.risk_level == body["risk_level"]
        assert txn.decision == body["decision"]
        assert txn.model_version == body["model_version"]
        assert txn.scored_at is not None

    @pytest.mark.asyncio
    async def test_audit_event_created_on_scoring(
        self, async_client: AsyncClient, analyst_user, score_headers: dict, db_session
    ):
        payload = make_payload(customer_id=f"CUST_{uuid.uuid4().hex[:6].upper()}")
        response = await post_score(async_client, score_headers, payload)
        assert response.status_code == 200
        body = response.json()

        result = await db_session.execute(
            select(AuditLog)
            .where(AuditLog.event == "TRANSACTION_SCORED")
            .where(AuditLog.transaction_id == body["transaction_id"])
        )
        event = result.scalar_one_or_none()
        assert event is not None
        assert event.actor == analyst_user.username
        meta = event.metadata_
        assert meta["model_version"] == body["model_version"]
        assert meta["risk_level"] == body["risk_level"]
        assert meta["decision"] == body["decision"]
        assert meta["fraud_probability"] == pytest.approx(body["fraud_probability"])
