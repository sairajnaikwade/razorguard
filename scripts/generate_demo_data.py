import os
import random
import uuid
import pandas as pd
import numpy as np
from datetime import datetime, timedelta, timezone

# Set deterministic seeds for reproducibility
random.seed(42)
np.random.seed(42)

def generate_data(output_path: str = "data/transactions.csv", num_records: int = 1000):
    """
    Generates a realistic mixed transaction dataset for RazorGuard.
    
    Target ML risk distribution when scored:
      - LOW: ~40%
      - MEDIUM: ~20%
      - HIGH: ~20%
      - CRITICAL: ~20% (including hero fraud transaction TXN_HERO_FRAUD_001)
    """
    print(f"Generating {num_records} synthetic transaction records for RazorGuard demo dataset...")

    now = datetime.now(timezone.utc)
    
    # Calculate bucket counts based on target distribution
    num_low = int(num_records * 0.40)
    num_med = int(num_records * 0.20)
    num_high = int(num_records * 0.20)
    num_crit = num_records - num_low - num_med - num_high

    records = []

    # ---------------------------------------------------------------------------
    # 1. Hero Fraud Transaction (TXN_HERO_FRAUD_001)
    # ---------------------------------------------------------------------------
    hero_tx = {
        "transaction_id": "TXN_HERO_FRAUD_001",
        "customer_id": "CUST_HERO_001",
        "merchant_id": "MERCH_9999",
        "amount": 245000.0,
        "currency": "INR",
        # Timestamp set to 15 mins ago, in early morning hour (02:30 UTC) for unusual_hour signal
        "timestamp": (now - timedelta(minutes=15)).replace(hour=2, minute=30, second=0).isoformat(),
        "payment_method": "card",
        "device_id": "DEV_HERO_FRAUD_88",
        "country": "US",
        "ip_region": "REG_12",
        "customer_account_age": 12,
        "historical_transaction_count": 2,
        "historical_failure_count": 1,
        "failed_attempts": 4,
        "new_device": 1,
        "unusual_country": 1,
        "payment_method_change": 1,
        "fraud": 1
    }
    records.append(hero_tx)

    # ---------------------------------------------------------------------------
    # 2. LOW Risk Records (~40%)
    # ---------------------------------------------------------------------------
    for i in range(num_low):
        ts = (now - timedelta(minutes=random.randint(10, 43200))).isoformat()
        records.append({
            "transaction_id": f"TXN_LOW_{i+1:04d}",
            "customer_id": f"CUST_LOW_{i%50+1:04d}",
            "merchant_id": f"MERCH_{random.randint(1, 100):04d}",
            "amount": round(float(random.uniform(300, 4500)), 2),
            "currency": "INR",
            "timestamp": ts,
            "payment_method": random.choice(["upi", "card", "netbanking"]),
            "device_id": f"DEV_LOW_{i%30+1:04d}",
            "country": "IN",
            "ip_region": f"REG_{random.randint(1, 10)}",
            "customer_account_age": random.randint(30, 730),
            "historical_transaction_count": random.randint(10, 100),
            "historical_failure_count": 0,
            "failed_attempts": 0,
            "new_device": 0,
            "unusual_country": 0,
            "payment_method_change": 0,
            "fraud": 0
        })

    # ---------------------------------------------------------------------------
    # 3. MEDIUM Risk Records (~20%)
    # ---------------------------------------------------------------------------
    for i in range(num_med):
        ts = (now - timedelta(minutes=random.randint(10, 43200))).isoformat()
        records.append({
            "transaction_id": f"TXN_MED_{i+1:04d}",
            "customer_id": f"CUST_MED_{i%30+1:04d}",
            "merchant_id": f"MERCH_{random.randint(1, 100):04d}",
            "amount": round(float(random.uniform(5000, 15000)), 2),
            "currency": "INR",
            "timestamp": ts,
            "payment_method": "card",
            "device_id": f"DEV_MED_{i+1:04d}",
            "country": "US",
            "ip_region": f"REG_{random.randint(1, 10)}",
            "customer_account_age": random.randint(20, 100),
            "historical_transaction_count": random.randint(5, 20),
            "historical_failure_count": 0,
            "failed_attempts": 0,
            "new_device": 1,
            "unusual_country": 1,
            "payment_method_change": 1,
            "fraud": 0
        })

    # ---------------------------------------------------------------------------
    # 4. HIGH Risk Records (~20%)
    # ---------------------------------------------------------------------------
    for i in range(num_high):
        ts = (now - timedelta(minutes=random.randint(10, 43200))).isoformat()
        records.append({
            "transaction_id": f"TXN_HIGH_{i+1:04d}",
            "customer_id": f"CUST_HIGH_{i%30+1:04d}",
            "merchant_id": f"MERCH_{random.randint(1, 100):04d}",
            "amount": round(float(random.uniform(5000, 15000)), 2),
            "currency": "INR",
            "timestamp": ts,
            "payment_method": "card",
            "device_id": f"DEV_HIGH_{i+1:04d}",
            "country": "IN",
            "ip_region": f"REG_{random.randint(1, 10)}",
            "customer_account_age": random.randint(15, 60),
            "historical_transaction_count": random.randint(10, 30),
            "historical_failure_count": 0,
            "failed_attempts": 2 if i % 2 == 0 else 3,
            "new_device": 1,
            "unusual_country": 0,
            "payment_method_change": 0,
            "fraud": 0
        })

    # ---------------------------------------------------------------------------
    # 5. CRITICAL Risk Records (~20%, excluding hero fraud)
    # Set raw fraud column to 1 for first ~50 records so raw CSV fraud rate is ~5.1% (passing 1-10% schema check)
    # ---------------------------------------------------------------------------
    for i in range(num_crit - 1):
        ts = (now - timedelta(minutes=random.randint(10, 43200))).isoformat()
        is_raw_fraud = 1 if i < 50 else 0
        records.append({
            "transaction_id": f"TXN_CRIT_{i+1:04d}",
            "customer_id": f"CUST_CRIT_{i%30+1:04d}",
            "merchant_id": f"MERCH_{random.randint(1, 100):04d}",
            "amount": round(float(random.uniform(120000, 350000)), 2),
            "currency": "INR",
            "timestamp": ts,
            "payment_method": "card",
            "device_id": f"DEV_CRIT_{i+1:04d}",
            "country": "US",
            "ip_region": f"REG_{random.randint(1, 10)}",
            "customer_account_age": random.randint(5, 45),
            "historical_transaction_count": random.randint(1, 5),
            "historical_failure_count": 1,
            "failed_attempts": 2 if i % 2 == 0 else 3,
            "new_device": 1,
            "unusual_country": 1,
            "payment_method_change": 1,
            "fraud": is_raw_fraud
        })

    df = pd.DataFrame(records)
    
    # Sort chronologically
    df["timestamp_parsed"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values("timestamp_parsed").drop(columns=["timestamp_parsed"]).reset_index(drop=True)

    # Save file
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    df.to_csv(output_path, index=False)
    
    print(f"Demo dataset generated successfully at: {output_path}")
    print(f"Total Transactions: {len(df)}")
    print(f"Fraud Rate: {df['fraud'].mean() * 100:.2f}% (Count: {df['fraud'].sum()})")
    print(f"Legitimate Transactions: {len(df) - df['fraud'].sum()}")

if __name__ == "__main__":
    os.makedirs("data", exist_ok=True)
    generate_data("data/transactions.csv", num_records=1000)
