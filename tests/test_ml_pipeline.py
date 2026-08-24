"""
ML pipeline tests — dataset validation, feature engineering, leakage prevention,
data splits, metrics, threshold, cost model, and artifact loading.
"""

import os
import json
import pytest
import pandas as pd
import numpy as np

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
DATA_PATH = "data/transactions.csv"
ARTIFACTS_DIR = "ml/artifacts"
MODEL_PATH = os.path.join(ARTIFACTS_DIR, "model.joblib")
PREPROCESSOR_PATH = os.path.join(ARTIFACTS_DIR, "preprocessor.joblib")
METADATA_PATH = os.path.join(ARTIFACTS_DIR, "model_metadata.json")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def dataset():
    return pd.read_csv(DATA_PATH)


@pytest.fixture(scope="module")
def metadata():
    with open(METADATA_PATH) as f:
        return json.load(f)


@pytest.fixture(scope="module")
def splits(dataset):
    df = dataset.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values("timestamp").reset_index(drop=True)
    n = len(df)
    train_end = int(n * 0.70)
    val_end = int(n * 0.85)
    return {
        "train": df.iloc[:train_end],
        "val": df.iloc[train_end:val_end],
        "test": df.iloc[val_end:],
    }


# ===========================================================================
# 1. Dataset Validation
# ===========================================================================
class TestDatasetValidation:
    """Validate the integrity and schema of the raw dataset."""

    def test_dataset_exists(self):
        assert os.path.exists(DATA_PATH), "Dataset file must exist"

    def test_no_missing_values(self, dataset):
        assert dataset.isnull().sum().sum() == 0, "Dataset must have no missing values"

    def test_no_duplicate_transaction_ids(self, dataset):
        assert dataset["transaction_id"].is_unique, "Transaction IDs must be unique"

    def test_required_columns_present(self, dataset):
        required = [
            "transaction_id", "customer_id", "merchant_id", "amount",
            "currency", "timestamp", "payment_method", "device_id",
            "country", "ip_region", "customer_account_age",
            "historical_transaction_count", "historical_failure_count",
            "failed_attempts", "new_device", "unusual_country",
            "payment_method_change", "fraud",
        ]
        for col in required:
            assert col in dataset.columns, f"Missing required column: {col}"

    def test_fraud_is_binary(self, dataset):
        assert set(dataset["fraud"].unique()).issubset({0, 1}), "Target must be binary"

    def test_amounts_positive(self, dataset):
        assert (dataset["amount"] > 0).all(), "All amounts must be positive"

    def test_timestamps_parseable(self, dataset):
        pd.to_datetime(dataset["timestamp"])  # will raise on failure

    def test_fraud_rate_reasonable(self, dataset):
        fraud_rate = dataset["fraud"].mean()
        assert 0.01 <= fraud_rate <= 0.10, f"Fraud rate {fraud_rate:.4f} is outside expected 1-10% range"


# ===========================================================================
# 2. Feature Engineering
# ===========================================================================
class TestFeatureEngineering:
    """Verify feature generation correctness."""

    def test_feature_engineer_fit_transform_produces_features(self, splits):
        from ml.features import FeatureEngineer
        eng = FeatureEngineer()
        X = eng.fit_transform(splits["train"].copy())
        assert X.shape[0] == len(splits["train"]), "Row count must match"
        assert X.shape[1] > 0, "Must produce at least one feature"
        assert not X.isnull().any().any(), "Features must not contain NaN after fit_transform"

    def test_transform_matches_fitted_columns(self, splits):
        from ml.features import FeatureEngineer
        eng = FeatureEngineer()
        eng.fit_transform(splits["train"].copy())
        X_val = eng.transform(splits["val"].copy())
        assert list(X_val.columns) == eng.feature_columns, "Column order must match fitted columns"


# ===========================================================================
# 3. Target Leakage Prevention
# ===========================================================================
class TestLeakagePrevention:
    """Ensure no future information or target leakage in features."""

    def test_fraud_column_not_in_features(self, metadata):
        features = metadata["features"]
        assert "fraud" not in features, "'fraud' target must not appear as a feature"

    def test_no_future_columns_in_features(self, metadata):
        """Columns like 'risk_level', 'fraud_probability' must not be features."""
        forbidden = {"fraud", "is_fraud", "fraud_probability", "risk_level", "label"}
        overlap = forbidden & set(metadata["features"])
        assert len(overlap) == 0, f"Features contain target-leaking columns: {overlap}"

    def test_expanding_customer_mean_excludes_current(self, splits):
        """For the very first transaction of a customer, amount_vs_customer_average should be 1.0 (no history)."""
        from ml.features import FeatureEngineer
        eng = FeatureEngineer()
        # Use a small synthetic dataframe with one customer
        df = pd.DataFrame({
            "transaction_id": ["TX1", "TX2", "TX3"],
            "customer_id": ["C1", "C1", "C1"],
            "merchant_id": ["M1", "M1", "M1"],
            "amount": [100.0, 200.0, 300.0],
            "currency": ["INR", "INR", "INR"],
            "timestamp": pd.to_datetime(["2026-01-01 10:00", "2026-01-01 10:05", "2026-01-01 10:10"]),
            "payment_method": ["UPI", "UPI", "UPI"],
            "device_id": ["D1", "D1", "D1"],
            "country": ["IN", "IN", "IN"],
            "ip_region": ["REG_1", "REG_1", "REG_1"],
            "customer_account_age": [100, 100, 100],
            "historical_transaction_count": [0, 1, 2],
            "historical_failure_count": [0, 0, 0],
            "failed_attempts": [0, 0, 0],
            "new_device": [0, 0, 0],
            "unusual_country": [0, 0, 0],
            "payment_method_change": [0, 0, 0],
            "fraud": [0, 0, 0],
        })
        feats = eng._create_raw_features(df)
        # First tx for customer: no prior history, ratio should be 1.0
        assert feats.iloc[0]["amount_vs_customer_average"] == pytest.approx(1.0)
        # Second tx: average of prior tx (100), current is 200, ratio = 200/100 = 2.0
        assert feats.iloc[1]["amount_vs_customer_average"] == pytest.approx(2.0)

    def test_velocity_features_exclude_current_transaction(self, splits):
        """First transaction for any customer should have 0 velocity counts."""
        from ml.features import FeatureEngineer
        df = pd.DataFrame({
            "transaction_id": ["TX1"],
            "customer_id": ["NEW_CUST"],
            "merchant_id": ["M1"],
            "amount": [500.0],
            "currency": ["INR"],
            "timestamp": pd.to_datetime(["2026-01-01 12:00"]),
            "payment_method": ["card"],
            "device_id": ["D1"],
            "country": ["IN"],
            "ip_region": ["REG_1"],
            "customer_account_age": [30],
            "historical_transaction_count": [0],
            "historical_failure_count": [0],
            "failed_attempts": [0],
            "new_device": [1],
            "unusual_country": [0],
            "payment_method_change": [0],
            "fraud": [0],
        })
        eng = FeatureEngineer()
        feats = eng._create_raw_features(df)
        assert feats.iloc[0]["transactions_last_5m"] == 0.0
        assert feats.iloc[0]["transactions_last_1h"] == 0.0
        assert feats.iloc[0]["amount_last_1h"] == 0.0


# ===========================================================================
# 4. Train / Validation / Test Separation
# ===========================================================================
class TestDataSplit:
    """Verify that data splits follow the 70/15/15 chronological protocol."""

    def test_split_sizes(self, dataset, splits):
        n = len(dataset)
        assert len(splits["train"]) == int(n * 0.70)
        assert len(splits["val"]) == int(n * 0.85) - int(n * 0.70)
        assert len(splits["test"]) == n - int(n * 0.85)

    def test_chronological_order(self, splits):
        """All training timestamps must precede all validation timestamps,
        and all validation timestamps must precede all test timestamps."""
        train_max = pd.to_datetime(splits["train"]["timestamp"]).max()
        val_min = pd.to_datetime(splits["val"]["timestamp"]).min()
        val_max = pd.to_datetime(splits["val"]["timestamp"]).max()
        test_min = pd.to_datetime(splits["test"]["timestamp"]).min()
        assert train_max <= val_min, "Training data must precede validation data"
        assert val_max <= test_min, "Validation data must precede test data"

    def test_no_overlap_between_splits(self, splits):
        train_ids = set(splits["train"]["transaction_id"])
        val_ids = set(splits["val"]["transaction_id"])
        test_ids = set(splits["test"]["transaction_id"])
        assert len(train_ids & val_ids) == 0
        assert len(train_ids & test_ids) == 0
        assert len(val_ids & test_ids) == 0


# ===========================================================================
# 5. Metrics Calculation
# ===========================================================================
class TestMetrics:
    """Verify that metric calculations produce valid results."""

    def test_perfect_predictions(self):
        from ml.metrics import calculate_metrics
        y_true = np.array([0, 0, 1, 1])
        y_pred = np.array([0, 0, 1, 1])
        y_prob = np.array([0.1, 0.2, 0.9, 0.95])
        m = calculate_metrics(y_true, y_pred, y_prob)
        assert m["precision"] == 1.0
        assert m["recall"] == 1.0
        assert m["f1"] == 1.0
        assert m["fp"] == 0
        assert m["fn"] == 0

    def test_all_wrong_predictions(self):
        from ml.metrics import calculate_metrics
        y_true = np.array([0, 0, 1, 1])
        y_pred = np.array([1, 1, 0, 0])
        y_prob = np.array([0.9, 0.8, 0.1, 0.2])
        m = calculate_metrics(y_true, y_pred, y_prob)
        assert m["precision"] == 0.0
        assert m["recall"] == 0.0
        assert m["fp"] == 2
        assert m["fn"] == 2

    def test_metrics_values_in_range(self, metadata):
        test_m = metadata["held_out_test_metrics"]
        for key in ["accuracy", "precision", "recall", "f1", "roc_auc", "pr_auc"]:
            assert 0.0 <= test_m[key] <= 1.0, f"{key} out of [0, 1] range"


# ===========================================================================
# 6. Threshold Calculation
# ===========================================================================
class TestThreshold:
    """Verify threshold optimization selects a valid threshold."""

    def test_selected_threshold_in_valid_range(self, metadata):
        t = metadata["selected_threshold"]
        assert 0.0 < t < 1.0, f"Threshold {t} must be between 0 and 1"

    def test_threshold_optimization_minimizes_cost(self):
        from ml.threshold import BusinessCostModel
        y_true = np.array([0, 0, 0, 0, 1, 1])
        y_prob = np.array([0.05, 0.1, 0.3, 0.4, 0.7, 0.9])
        amounts = np.array([100, 200, 300, 400, 5000, 8000])
        cost_model = BusinessCostModel(fp_unit_cost=50.0)
        best_t, df_results = cost_model.optimize_threshold(y_true, y_prob, amounts)
        # The selected threshold should have the minimum total_cost
        min_cost_row = df_results.loc[df_results["total_cost"].idxmin()]
        assert best_t == min_cost_row["threshold"]


# ===========================================================================
# 7. Cost Model
# ===========================================================================
class TestCostModel:
    """Verify false-positive and false-negative cost logic."""

    def test_fp_cost_formula(self):
        from ml.threshold import BusinessCostModel
        cost_model = BusinessCostModel(fp_unit_cost=50.0)
        y_true = np.array([0, 0, 0])
        y_prob = np.array([0.8, 0.9, 0.7])
        amounts = np.array([100, 200, 300])
        result = cost_model.calculate_cost(y_true, y_prob, 0.5, amounts)
        # All legitimate flagged as fraud → 3 FPs
        assert result["false_positives"] == 3
        assert result["fp_cost"] == 3 * 50.0

    def test_fn_cost_is_missed_fraud_amount(self):
        from ml.threshold import BusinessCostModel
        cost_model = BusinessCostModel(fp_unit_cost=50.0)
        y_true = np.array([1, 1, 0])
        y_prob = np.array([0.1, 0.2, 0.1])
        amounts = np.array([5000, 8000, 100])
        result = cost_model.calculate_cost(y_true, y_prob, 0.5, amounts)
        # Both fraud transactions missed (prob < threshold)
        assert result["false_negatives"] == 2
        assert result["fn_cost"] == pytest.approx(5000 + 8000)

    def test_total_cost_is_sum(self):
        from ml.threshold import BusinessCostModel
        cost_model = BusinessCostModel(fp_unit_cost=50.0)
        y_true = np.array([0, 1])
        y_prob = np.array([0.9, 0.1])
        amounts = np.array([100, 3000])
        result = cost_model.calculate_cost(y_true, y_prob, 0.5, amounts)
        assert result["total_cost"] == pytest.approx(result["fp_cost"] + result["fn_cost"])


# ===========================================================================
# 8. Model Artifact Loading
# ===========================================================================
class TestArtifacts:
    """Verify all model artifacts exist and are loadable."""

    def test_model_artifact_exists(self):
        assert os.path.exists(MODEL_PATH), "model.joblib must exist"

    def test_preprocessor_artifact_exists(self):
        assert os.path.exists(PREPROCESSOR_PATH), "preprocessor.joblib must exist"

    def test_metadata_artifact_exists(self):
        assert os.path.exists(METADATA_PATH), "model_metadata.json must exist"

    def test_model_loads_and_predicts(self):
        from ml.models import BaseModelWrapper
        model = BaseModelWrapper.load(MODEL_PATH)
        # Predict on a zero vector of the correct feature count
        with open(METADATA_PATH) as f:
            meta = json.load(f)
        n_features = len(meta["features"])
        X_dummy = np.zeros((1, n_features))
        prob = model.predict_proba(X_dummy)
        assert prob.shape == (1,)
        assert 0.0 <= prob[0] <= 1.0

    def test_preprocessor_loads(self):
        from ml.features import FeatureEngineer
        eng = FeatureEngineer.load(PREPROCESSOR_PATH)
        assert eng.fitted is True
        assert eng.feature_columns is not None
        assert len(eng.feature_columns) > 0

    def test_metadata_has_required_keys(self, metadata):
        for key in ["model_name", "selected_threshold", "features",
                     "validation_metrics", "held_out_test_metrics"]:
            assert key in metadata, f"Metadata missing key: {key}"
