import os
import random
import uuid
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

# Set deterministic seeds
random.seed(42)
np.random.seed(42)

def generate_data(output_path: str, num_records: int = 20000):
    print(f"Generating {num_records} synthetic transaction records...")
    
    # Establish base entities
    num_customers = 1500
    num_merchants = 400
    
    customer_ids = [f"CUST_{i:04d}" for i in range(num_customers)]
    merchant_ids = [f"MERCH_{i:04d}" for i in range(num_merchants)]
    
    # Pre-allocate customer profiles to maintain historical consistency
    # (e.g., standard amounts, typical device, account age)
    customer_profiles = {}
    for cid in customer_ids:
        base_age = random.randint(15, 1000)
        typical_amt = float(np.random.exponential(scale=1500) + 50)
        # some customers spend more
        if random.random() < 0.1:
            typical_amt *= 5
            
        typical_pm = random.choice(["UPI", "card", "netbanking"])
        typical_device = f"DEV_{uuid.uuid4().hex[:8].upper()}"
        typical_country = "IN" if random.random() < 0.95 else random.choice(["US", "GB", "AE", "SG"])
        
        customer_profiles[cid] = {
            "base_age": base_age,
            "typical_amt": typical_amt,
            "typical_pm": typical_pm,
            "typical_device": typical_device,
            "typical_country": typical_country,
            "tx_count": 0,
            "fail_count": 0,
            "prev_time": None,
            "prev_pm": None,
            "prev_device": None,
            "prev_country": None
        }

    # Start date for transactions (30 days ago)
    start_time = datetime.now() - timedelta(days=30)
    
    records = []
    
    # Generate chronologically sorted timestamps to prevent look-ahead leaks
    timestamps = [start_time + timedelta(seconds=i * (30 * 24 * 3600 // num_records) + random.randint(-30, 30))
                  for i in range(num_records)]
    timestamps.sort()

    for i in range(num_records):
        tx_id = f"TXN_{uuid.uuid4().hex[:12].upper()}"
        ts = timestamps[i]
        
        # Pick customer & merchant
        # Higher density on some customers/merchants
        cid = np.random.choice(customer_ids, p=[1.0/num_customers]*num_customers)
        mid = np.random.choice(merchant_ids)
        
        profile = customer_profiles[cid]
        
        # Determine features based on profile
        pm = profile["typical_pm"]
        device = profile["typical_device"]
        country = profile["typical_country"]
        
        # Default flags
        failed_attempts = 0
        new_device = 0
        unusual_country = 0
        payment_method_change = 0
        
        # Account age at transaction time
        account_age = profile["base_age"] + (ts - start_time).days
        
        # 1. Simulate behavior changes
        if profile["tx_count"] > 0:
            # Device change
            if random.random() < 0.05:
                device = f"DEV_{uuid.uuid4().hex[:8].upper()}"
                new_device = 1
            # PM change
            if random.random() < 0.08:
                pm = random.choice(["UPI", "card", "netbanking"])
                if pm != profile["prev_pm"]:
                    payment_method_change = 1
            # Country change
            if random.random() < 0.02:
                country = random.choice(["US", "GB", "AE", "SG", "IN"])
                if country != profile["typical_country"]:
                    unusual_country = 1

        # Base amount
        amount = float(np.random.normal(loc=profile["typical_amt"], scale=profile["typical_amt"]*0.3))
        amount = max(10.0, round(amount, 2))
        
        # 2. Check if transaction is Fraud
        is_fraud = 0
        
        # Fraud triggers (correlations)
        # Trigger A: Account takeover / card theft (unusual high amount, new device, failed attempts)
        # Trigger B: Velocity attack (multiple failed attempts, very high amount)
        # Trigger C: High value transactions from fresh/young accounts from unusual countries
        
        fraud_scenario = random.random()
        
        if fraud_scenario < 0.03: # Target ~3% fraud rate overall
            is_fraud = 1
            # Manipulate attributes to create strong indicators (non-random correlations)
            amount = float(profile["typical_amt"] * random.uniform(4.0, 10.0))
            failed_attempts = random.randint(2, 4)
            new_device = 1
            device = f"DEV_FRAUD_{uuid.uuid4().hex[:6].upper()}"
            
            if random.random() < 0.4:
                country = random.choice(["US", "GB", "AE", "SG"])
                unusual_country = 1
            if random.random() < 0.5:
                payment_method_change = 1
                pm = "card"
                
        else:
            # Legitimate transactions occasionally have deviations but less severe
            if random.random() < 0.02:
                failed_attempts = random.randint(1, 2)
            if random.random() < 0.01:
                amount = float(profile["typical_amt"] * random.uniform(2.0, 3.0))

        # Record metrics inside profile to dynamically keep track of historical facts
        # BUT: to make sure we don't leak, we record them AFTER generating this tx.
        # Let's save the snapshot of historical values available BEFORE this tx.
        hist_count = profile["tx_count"]
        hist_fail = profile["fail_count"]
        
        # Create record
        records.append({
            "transaction_id": tx_id,
            "customer_id": cid,
            "merchant_id": mid,
            "amount": amount,
            "currency": "INR",
            "timestamp": ts.isoformat(),
            "payment_method": pm,
            "device_id": device,
            "country": country,
            "ip_region": f"REG_{random.randint(1, 20)}",
            "customer_account_age": account_age,
            # Pass these historical snapshots to backend/ml for feature verification
            "historical_transaction_count": hist_count,
            "historical_failure_count": hist_fail,
            "failed_attempts": failed_attempts,
            "new_device": new_device,
            "unusual_country": unusual_country,
            "payment_method_change": payment_method_change,
            "fraud": is_fraud
        })
        
        # Update profile for future transactions
        profile["tx_count"] += 1
        if failed_attempts > 0:
            profile["fail_count"] += failed_attempts
        profile["prev_time"] = ts
        profile["prev_pm"] = pm
        profile["prev_device"] = device
        profile["prev_country"] = country

    df = pd.DataFrame(records)
    
    # Save file
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    df.to_csv(output_path, index=False)
    
    print(f"Dataset generated successfully at: {output_path}")
    print(f"Total Transactions: {len(df)}")
    print(f"Fraud Rate: {df['fraud'].mean() * 100:.2f}% (Count: {df['fraud'].sum()})")
    print(f"Legitimate Transactions: {len(df) - df['fraud'].sum()}")

if __name__ == "__main__":
    os.makedirs("data", exist_ok=True)
    generate_data("data/transactions.csv")
