import os
import json
import pandas as pd
import numpy as np

from ml.features import FeatureEngineer
from ml.models import BaseModelWrapper
from ml.metrics import calculate_metrics
from ml.threshold import BusinessCostModel

def main():
    print("====================================================")
    print("REPRODUCING HELD-OUT TEST EVALUATION")
    print("====================================================")
    
    # Paths
    preprocessor_path = "ml/artifacts/preprocessor.joblib"
    model_path = "ml/artifacts/model.joblib"
    metadata_path = "ml/artifacts/model_metadata.json"
    data_path = "data/transactions.csv"
    
    # Checks
    if not all(os.path.exists(p) for p in [preprocessor_path, model_path, metadata_path]):
        raise FileNotFoundError("Model artifacts not found. Please run ml/train.py first.")
        
    # Load metadata and artifacts
    with open(metadata_path, "r") as f:
        metadata = json.load(f)
        
    engineer = FeatureEngineer.load(preprocessor_path)
    model = BaseModelWrapper.load(model_path)
    opt_threshold = metadata["selected_threshold"]
    
    # Load and partition dataset (identical split)
    df = pd.read_csv(data_path)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values("timestamp").reset_index(drop=True)
    
    n = len(df)
    val_end = int(n * 0.85)
    test_df = df.iloc[val_end:].copy()
    test_amounts = test_df["amount"].values
    
    # Extract features
    X_test = engineer.transform(test_df)
    y_test = test_df["fraud"].values
    
    # Predict
    test_probs = model.predict_proba(X_test)
    test_preds = (test_probs >= opt_threshold).astype(int)
    
    # Calculate metrics
    test_metrics = calculate_metrics(y_test, test_preds, test_probs)
    cost_model = BusinessCostModel(fp_unit_cost=50.0)
    test_cost_stats = cost_model.calculate_cost(y_test, test_probs, opt_threshold, test_amounts)
    
    print("\n====================================")
    print("FINAL HELD-OUT TEST RESULTS")
    print("====================================")
    print(f"Locked Model:              {metadata['model_name']}")
    print(f"Locked Threshold:          {opt_threshold:.2f}")
    print(f"Accuracy:                  {test_metrics['accuracy']:.4f}")
    print(f"Precision:                 {test_metrics['precision']:.4f}")
    print(f"Recall:                    {test_metrics['recall']:.4f}")
    print(f"F1-Score:                  {test_metrics['f1']:.4f}")
    print(f"ROC-AUC:                   {test_metrics['roc_auc']:.4f}")
    print(f"PR-AUC:                    {test_metrics['pr_auc']:.4f}")
    print(f"False Positive Rate:       {test_metrics['fpr']:.4f}")
    print(f"False Negative Rate:       {test_metrics['fnr']:.4f}")
    print("\nConfusion Matrix:")
    print(f"  True Negatives (TN):     {test_metrics['tn']}")
    print(f"  False Positives (FP):    {test_metrics['fp']}")
    print(f"  False Negatives (FN):    {test_metrics['fn']}")
    print(f"  True Positives (TP):     {test_metrics['tp']}")
    print("\nBusiness Cost Performance (Held-out Test):")
    print(f"  False Positive Cost:     ₹{test_cost_stats['fp_cost']:,.2f}")
    print(f"  False Negative Cost:     ₹{test_cost_stats['fn_cost']:,.2f}")
    print(f"  Total Expected Cost:     ₹{test_cost_stats['total_cost']:,.2f}")
    print("====================================")

if __name__ == "__main__":
    main()
