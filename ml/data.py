import pandas as pd
import numpy as np

class DataValidator:
    """
    Validates the dataset schema and values to ensure data quality
    and prevent target leakage/corrupted inputs.
    """
    
    REQUIRED_COLUMNS = [
        "transaction_id",
        "customer_id",
        "merchant_id",
        "amount",
        "currency",
        "timestamp",
        "payment_method",
        "device_id",
        "country",
        "ip_region",
        "customer_account_age",
        "historical_transaction_count",
        "historical_failure_count",
        "failed_attempts",
        "new_device",
        "unusual_country",
        "payment_method_change",
        "fraud"
    ]
    
    @classmethod
    def validate(cls, df: pd.DataFrame) -> bool:
        """
        Validates the dataframe. Raises ValueError if validation fails.
        """
        print("Validating dataset...")
        
        # 1. Check required columns
        missing_cols = [col for col in cls.REQUIRED_COLUMNS if col not in df.columns]
        if missing_cols:
            raise ValueError(f"Missing required columns in dataset: {missing_cols}")
            
        # 2. Check null values
        null_counts = df[cls.REQUIRED_COLUMNS].isnull().sum()
        columns_with_nulls = null_counts[null_counts > 0]
        if not columns_with_nulls.empty:
            raise ValueError(f"Null values detected in critical columns:\n{columns_with_nulls}")
            
        # 3. Check invalid values for amount
        if (df["amount"] <= 0).any():
            invalid_amt_cnt = (df["amount"] <= 0).sum()
            raise ValueError(f"Detected {invalid_amt_cnt} transactions with amount <= 0. Amounts must be positive.")
            
        # 4. Check target value values (strictly binary)
        unique_fraud = df["fraud"].unique()
        if not set(unique_fraud).issubset({0, 1}):
            raise ValueError(f"Target variable 'fraud' contains non-binary values: {unique_fraud}")
            
        # 5. Check duplicate transaction IDs
        if df["transaction_id"].duplicated().any():
            dup_cnt = df["transaction_id"].duplicated().sum()
            raise ValueError(f"Detected {dup_cnt} duplicate transaction IDs. Each transaction must have a unique ID.")
            
        # 6. Validate customer account age
        if (df["customer_account_age"] < 0).any():
            invalid_age_cnt = (df["customer_account_age"] < 0).sum()
            raise ValueError(f"Detected {invalid_age_cnt} transactions with negative account age.")
            
        # 7. Validate timestamps are parseable
        try:
            pd.to_datetime(df["timestamp"])
        except Exception as e:
            raise ValueError(f"Failed to parse 'timestamp' column as datetime: {e}")
            
        print("Dataset validation passed successfully.")
        return True
