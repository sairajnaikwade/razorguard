import os
import json
import sys
import pandas as pd
from datetime import datetime

from ml.features import FeatureEngineer
from ml.models import BaseModelWrapper

def get_risk_level(prob: float) -> str:
    if prob < 0.30:
        return "LOW"
    elif prob < 0.60:
        return "MEDIUM"
    elif prob < 0.80:
        return "HIGH"
    else:
        return "CRITICAL"

def predict_transaction(tx_data: dict, history_path: str = "data/transactions.csv") -> dict:
    # Check artifacts
    preprocessor_path = "ml/artifacts/preprocessor.joblib"
    model_path = "ml/artifacts/model.joblib"
    metadata_path = "ml/artifacts/model_metadata.json"
    
    if not all(os.path.exists(p) for p in [preprocessor_path, model_path, metadata_path]):
        raise FileNotFoundError("Model artifacts not found. Please run ml/train.py first.")
        
    with open(metadata_path, "r") as f:
        metadata = json.load(f)
        
    engineer = FeatureEngineer.load(preprocessor_path)
    model = BaseModelWrapper.load(model_path)
    opt_threshold = metadata["selected_threshold"]
    
    # Check history to build proper context
    if os.path.exists(history_path):
        df_history = pd.read_csv(history_path)
    else:
        df_history = pd.DataFrame(columns=tx_data.keys())
        
    # Append the new transaction to the customer's history
    df_tx = pd.DataFrame([tx_data])
    df_combined = pd.concat([df_history, df_tx], ignore_index=True)
    
    # Process features on the combined dataset
    X_combined = engineer.transform(df_combined)
    
    # Extract the features for the target transaction (the last row)
    X_tx = X_combined.iloc[[-1]]
    
    # Predict
    prob = float(model.predict_proba(X_tx)[0])
    risk = get_risk_level(prob)
    
    return {
        "fraud_probability": round(prob, 4),
        "risk_level": risk,
        "threshold": opt_threshold
    }

if __name__ == "__main__":
    # If a transaction JSON string is provided in args or stdin, use it.
    # Otherwise, use a default suspicious/critical demo scenario.
    tx_payload = None
    
    if len(sys.argv) > 1:
        try:
            tx_payload = json.loads(sys.argv[1])
        except Exception:
            pass
            
    if tx_payload is None and not sys.stdin.isatty():
        try:
            tx_payload = json.loads(sys.stdin.read())
        except Exception:
            pass
            
    if tx_payload is None:
        # Default scenario: Suspicious high value, multiple failed attempts, new device
        tx_payload = {
            "transaction_id": "TXN_DEMO_TEST",
            "customer_id": "CUST_0042",
            "merchant_id": "MERCH_0010",
            "amount": 240000.0,
            "currency": "INR",
            "timestamp": datetime.now().isoformat(),
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
            "fraud": 0 # ignored during inference
        }
        
    try:
        result = predict_transaction(tx_payload)
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
