import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
import joblib
import os

class FeatureEngineer:
    """
    Engineers and scales features for model training and prediction.
    Maintains time-safety (no future look-ahead) and target leakage prevention.
    """
    
    def __init__(self):
        self.scaler = StandardScaler()
        self.fitted = False
        self.feature_columns = None
        self.categorical_mappings = {}

    def fit_transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Fits transformers on the training dataframe and returns engineered features.
        """
        df_feats = self._create_raw_features(df)
        
        # Determine numerical and categorical columns
        numerical_cols = [
            "amount", "customer_account_age", "historical_transaction_count",
            "historical_failure_count", "historical_failure_rate", "failed_attempts",
            "transactions_last_5m", "transactions_last_1h", "amount_last_1h",
            "time_since_previous_transaction", "amount_vs_customer_average", "amount_deviation"
        ]
        
        # Fill NaNs
        df_feats[numerical_cols] = df_feats[numerical_cols].fillna(0)
        
        # Standardize numerical features
        scaled_nums = self.scaler.fit_transform(df_feats[numerical_cols])
        df_scaled_nums = pd.DataFrame(scaled_nums, columns=numerical_cols, index=df_feats.index)
        
        # Categorical Encoding: Payment Method
        pm_dummies = pd.get_dummies(df_feats["payment_method"], prefix="pm", dtype=float)
        # Handle new device, unusual country, payment method change as binary features
        binary_cols = ["new_device", "unusual_country", "payment_method_change", "country_change", "unusual_transaction_hour"]
        
        # Combine
        X = pd.concat([df_scaled_nums, pm_dummies, df_feats[binary_cols]], axis=1)
        
        self.feature_columns = list(X.columns)
        self.fitted = True
        
        return X

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Transforms the dataframe using the fitted configurations.
        """
        if not self.fitted:
            raise ValueError("FeatureEngineer is not fitted yet.")
            
        df_feats = self._create_raw_features(df)
        
        numerical_cols = [
            "amount", "customer_account_age", "historical_transaction_count",
            "historical_failure_count", "historical_failure_rate", "failed_attempts",
            "transactions_last_5m", "transactions_last_1h", "amount_last_1h",
            "time_since_previous_transaction", "amount_vs_customer_average", "amount_deviation"
        ]
        
        df_feats[numerical_cols] = df_feats[numerical_cols].fillna(0)
        
        scaled_nums = self.scaler.transform(df_feats[numerical_cols])
        df_scaled_nums = pd.DataFrame(scaled_nums, columns=numerical_cols, index=df_feats.index)
        
        # Payment method dummies matching fitted columns
        pm_dummies = pd.get_dummies(df_feats["payment_method"], prefix="pm", dtype=float)
        
        binary_cols = ["new_device", "unusual_country", "payment_method_change", "country_change", "unusual_transaction_hour"]
        X = pd.concat([df_scaled_nums, pm_dummies, df_feats[binary_cols]], axis=1)
        
        # Align columns (fill missing dummy columns with 0, drop extra ones)
        for col in self.feature_columns:
            if col not in X.columns:
                X[col] = 0.0
        X = X[self.feature_columns]
        
        return X

    def _create_raw_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Calculates behavior and velocity features without data leakage.
        Ensures input dataframe is sorted by timestamp first.
        """
        df_sorted = df.copy()
        df_sorted["timestamp"] = pd.to_datetime(df_sorted["timestamp"])
        df_sorted = df_sorted.sort_values("timestamp")
        
        # 1. Historical Failure Rate
        df_sorted["historical_failure_rate"] = df_sorted["historical_failure_count"] / df_sorted["historical_transaction_count"].replace(0, 1)
        
        # 2. Time-dependent customer statistics (expanding windows on previous transactions)
        # Shift amounts by 1 to exclude current transaction amount from historical average
        shifted_amt = df_sorted.groupby("customer_id")["amount"].shift(1)
        cust_expanding_mean = df_sorted.groupby("customer_id")["amount"].transform(lambda x: x.shift(1).expanding().mean())
        cust_expanding_std = df_sorted.groupby("customer_id")["amount"].transform(lambda x: x.shift(1).expanding().std())
        
        df_sorted["amount_vs_customer_average"] = df_sorted["amount"] / cust_expanding_mean.fillna(df_sorted["amount"])
        df_sorted["amount_vs_customer_average"] = df_sorted["amount_vs_customer_average"].replace([np.inf, -np.inf], 1.0).fillna(1.0)
        
        df_sorted["amount_deviation"] = (df_sorted["amount"] - cust_expanding_mean) / cust_expanding_std.fillna(1.0)
        df_sorted["amount_deviation"] = df_sorted["amount_deviation"].replace([np.inf, -np.inf], 0.0).fillna(0.0)
        
        # 3. Rolling velocity counts (excluding the current transaction)
        # Convert index to DatetimeIndex to support rolling on time windows
        # Save the integer index for safe re-alignment after rolling
        df_sorted = df_sorted.reset_index(drop=True)
        orig_idx = df_sorted.index  # guaranteed unique integer index
        df_time = df_sorted.set_index("timestamp")
        
        # Rolling count in past 5m
        rolling_5m = df_time.groupby("customer_id").rolling("5min")["transaction_id"].count()
        # Rolling count in past 1h
        rolling_1h = df_time.groupby("customer_id").rolling("1h")["transaction_id"].count()
        # Rolling amount in past 1h
        rolling_amt_1h = df_time.groupby("customer_id").rolling("1h")["amount"].sum()
        
        # Re-align: drop the customer_id group level, restore the original integer index
        # The inner index after groupby rolling is the timestamp; df_time's index maps
        # back to the original integer positions via df_sorted's row order.
        def _realign(rolling_series, df_ref):
            """Safely align a groupby-rolling result back to the original integer-indexed df."""
            s = rolling_series.reset_index(level=0, drop=True)  # drop customer_id level
            # s is now indexed by timestamp (from df_time). Since df_time was created
            # from df_sorted which has a unique integer index, we can recover that index.
            s.index = df_ref.index  # assign back the integer index from df_sorted
            return s

        aligned_5m = _realign(rolling_5m, df_sorted)
        aligned_1h = _realign(rolling_1h, df_sorted)
        aligned_amt_1h = _realign(rolling_amt_1h, df_sorted)
        
        # Shift rolling counts by 1 inside group to exclude the current transaction
        df_sorted["transactions_last_5m"] = aligned_5m.groupby(df_sorted["customer_id"]).shift(1).fillna(0).values
        df_sorted["transactions_last_1h"] = aligned_1h.groupby(df_sorted["customer_id"]).shift(1).fillna(0).values
        df_sorted["amount_last_1h"] = aligned_amt_1h.groupby(df_sorted["customer_id"]).shift(1).fillna(0).values
        
        # 4. Time since previous transaction
        prev_time = df_sorted.groupby("customer_id")["timestamp"].shift(1)
        df_sorted["time_since_previous_transaction"] = (df_sorted["timestamp"] - prev_time).dt.total_seconds().fillna(86400)
        
        # 5. Country change
        prev_country = df_sorted.groupby("customer_id")["country"].shift(1)
        df_sorted["country_change"] = ((df_sorted["country"] != prev_country) & prev_country.notnull()).astype(int)
        
        # 6. Time features
        df_sorted["transaction_hour"] = df_sorted["timestamp"].dt.hour
        df_sorted["day_of_week"] = df_sorted["timestamp"].dt.dayofweek
        df_sorted["unusual_transaction_hour"] = ((df_sorted["transaction_hour"] >= 0) & (df_sorted["transaction_hour"] <= 5)).astype(int)
        
        return df_sorted

    def save(self, filepath: str):
        """Saves the fitted FeatureEngineer artifact."""
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        joblib.dump(self, filepath)
        print(f"FeatureEngineer artifact saved to: {filepath}")

    @classmethod
    def load(cls, filepath: str) -> "FeatureEngineer":
        """Loads a pre-trained FeatureEngineer artifact."""
        return joblib.load(filepath)
