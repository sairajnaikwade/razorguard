import os
import json
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import joblib

from ml.data import DataValidator
from ml.features import FeatureEngineer
from ml.models import LogisticRegressionWrapper, RandomForestWrapper, AnomalyModelWrapper
from ml.metrics import calculate_metrics, get_roc_curve_data, get_pr_curve_data
from sklearn.metrics import auc
from ml.threshold import BusinessCostModel

def main():
    print("====================================================")
    # 1. Load Data
    data_path = "data/transactions.csv"
    if not os.path.exists(data_path):
        raise FileNotFoundError(f"Dataset not found at {data_path}. Please run generate_demo_data.py first.")
        
    df = pd.read_csv(data_path)
    
    # 2. Validate Data
    DataValidator.validate(df)
    
    # 3. Time-safe Chronological Split (70/15/15)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values("timestamp").reset_index(drop=True)
    
    n = len(df)
    train_end = int(n * 0.70)
    val_end = int(n * 0.85)
    
    train_df = df.iloc[:train_end].copy()
    val_df = df.iloc[train_end:val_end].copy()
    test_df = df.iloc[val_end:].copy()
    
    print(f"Data Split Summary:")
    print(f"  Train samples:      {len(train_df)} (Fraud: {train_df['fraud'].sum()}, Legitimate: {len(train_df) - train_df['fraud'].sum()})")
    print(f"  Validation samples: {len(val_df)} (Fraud: {val_df['fraud'].sum()}, Legitimate: {len(val_df) - val_df['fraud'].sum()})")
    print(f"  Held-out Test:     {len(test_df)} (Fraud: {test_df['fraud'].sum()}, Legitimate: {len(test_df) - test_df['fraud'].sum()})")
    
    # 4. Feature Engineering
    engineer = FeatureEngineer()
    X_train = engineer.fit_transform(train_df)
    y_train = train_df["fraud"].values
    
    X_val = engineer.transform(val_df)
    y_val = val_df["fraud"].values
    val_amounts = val_df["amount"].values
    
    X_test = engineer.transform(test_df)
    y_test = test_df["fraud"].values
    test_amounts = test_df["amount"].values
    
    # 5. Train Models
    print("\nTraining models...")
    
    # Model A: Baseline Logistic Regression
    lr_wrapper = LogisticRegressionWrapper()
    lr_wrapper.fit(X_train, y_train)
    
    # Model B: Primary Random Forest Classifier
    rf_wrapper = RandomForestWrapper()
    rf_wrapper.fit(X_train, y_train)
    
    # Model C: Anomaly Isolation Forest
    if_wrapper = AnomalyModelWrapper()
    # Isolation forest fit is unsupervised/self-supervised on normal training transactions only to act as an anomaly model
    X_train_legit = X_train[y_train == 0]
    if_wrapper.fit(X_train_legit)
    
    # 6. Evaluate Models on Validation Set
    print("\nEvaluating models on validation data...")
    models = {
        "Logistic Regression": lr_wrapper,
        "Random Forest": rf_wrapper,
        "Isolation Forest": if_wrapper
    }
    
    validation_results = {}
    for name, wrapper in models.items():
        probs = wrapper.predict_proba(X_val)
        # using default 0.5 threshold for initial evaluation
        preds = (probs >= 0.5).astype(int)
        
        metrics = calculate_metrics(y_val, preds, probs)
        validation_results[name] = metrics
        print(f"  {name:20s} - Precision: {metrics['precision']:.4f}, Recall: {metrics['recall']:.4f}, F1: {metrics['f1']:.4f}, PR-AUC: {metrics['pr_auc']:.4f}")
        
    # 7. Model Selection
    # Select best model based on validation PR-AUC (handles imbalanced classes best)
    best_model_name = max(validation_results, key=lambda k: validation_results[k]["pr_auc"])
    best_model_wrapper = models[best_model_name]
    print(f"\nSelected final model: {best_model_name}")
    
    # 8. Threshold Optimization (Cost-based validation)
    print("\nRunning business cost threshold optimization on validation data...")
    cost_model = BusinessCostModel(fp_unit_cost=50.0)
    best_model_val_probs = best_model_wrapper.predict_proba(X_val)
    
    opt_threshold, df_threshold_costs = cost_model.optimize_threshold(
        y_val, best_model_val_probs, val_amounts
    )
    print(f"Optimal threshold determined: {opt_threshold}")
    
    # Save threshold curve plot
    os.makedirs("ml/artifacts", exist_ok=True)
    cost_model.plot_cost_curve(df_threshold_costs, "ml/artifacts/threshold_vs_cost.png")
    
    # Print threshold table
    print("\nThreshold Cost Matrix (Validation Data):")
    print(df_threshold_costs[["threshold", "precision", "recall", "f1", "false_positives", "false_negatives", "fp_cost", "fn_cost", "total_cost"]].to_string(index=False))
    
    # 9. Lock final model + threshold and evaluate on HELD-OUT TEST
    print("\nLocking final model + threshold and evaluating on HELD-OUT TEST SET...")
    best_model_test_probs = best_model_wrapper.predict_proba(X_test)
    best_model_test_preds = (best_model_test_probs >= opt_threshold).astype(int)
    
    test_metrics = calculate_metrics(y_test, best_model_test_preds, best_model_test_probs)
    
    # Calculate costs on held-out test data
    test_cost_stats = cost_model.calculate_cost(y_test, best_model_test_probs, opt_threshold, test_amounts)
    
    print("\n====================================")
    print("FINAL HELD-OUT TEST RESULTS")
    print("====================================")
    print(f"Locked Model:              {best_model_name}")
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
    
    # 10. Generate Plot Curves
    _save_roc_pr_plots(y_test, best_model_test_probs)
    
    # 11. Save model artifacts
    engineer.save("ml/artifacts/preprocessor.joblib")
    best_model_wrapper.save("ml/artifacts/model.joblib")
    
    # Save metadata JSON for prediction use
    metadata = {
        "model_name": best_model_name,
        "selected_threshold": opt_threshold,
        "features": engineer.feature_columns,
        "validation_metrics": validation_results,
        "held_out_test_metrics": {**test_metrics, **test_cost_stats}
    }
    
    with open("ml/artifacts/model_metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)
    print("Model metadata successfully saved to: ml/artifacts/model_metadata.json")

def _save_roc_pr_plots(y_true, y_prob):
    os.makedirs("ml/artifacts", exist_ok=True)
    plt.style.use('dark_background')
    
    # ROC Plot
    roc_data = get_roc_curve_data(y_true, y_prob)
    plt.figure(figsize=(8, 6))
    plt.plot(roc_data["fpr"], roc_data["tpr"], color="#3b82f6", linewidth=2, label=f"ROC Curve (AUC = {auc(roc_data['fpr'], roc_data['tpr']):.4f})")
    plt.plot([0, 1], [0, 1], color="#475569", linestyle="--")
    plt.title("ROC Curve (Held-out Test)", fontsize=14, pad=15)
    plt.xlabel("False Positive Rate", fontsize=12)
    plt.ylabel("True Positive Rate", fontsize=12)
    plt.grid(True, color="#334155", linestyle="-", linewidth=0.5)
    plt.legend(loc="lower right", facecolor="#0f172a", edgecolor="#1e293b")
    plt.tight_layout()
    plt.savefig("ml/artifacts/roc_curve.png", dpi=150, facecolor="#0f172a")
    plt.close()
    
    # PR Plot
    pr_data = get_pr_curve_data(y_true, y_prob)
    plt.figure(figsize=(8, 6))
    plt.plot(pr_data["recall"], pr_data["precision"], color="#22c55e", linewidth=2, label=f"PR Curve (AUC = {auc(pr_data['recall'], pr_data['precision']):.4f})")
    plt.title("Precision-Recall Curve (Held-out Test)", fontsize=14, pad=15)
    plt.xlabel("Recall", fontsize=12)
    plt.ylabel("Precision", fontsize=12)
    plt.grid(True, color="#334155", linestyle="-", linewidth=0.5)
    plt.legend(loc="lower left", facecolor="#0f172a", edgecolor="#1e293b")
    plt.tight_layout()
    plt.savefig("ml/artifacts/pr_curve.png", dpi=150, facecolor="#0f172a")
    plt.close()
    print("ROC and Precision-Recall plots saved to ml/artifacts/")

if __name__ == "__main__":
    main()
