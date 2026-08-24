import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import os
import json

class BusinessCostModel:
    """
    Evaluates business cost trade-offs at different classification thresholds.
    Assumptions:
      - False Positive (FP) Unit Cost: Configurable (default ₹50.0). Represents analyst manual review cost.
      - False Negative (FN) Unit Cost: Transaction amount (the direct financial loss of missed fraud).
    """
    
    def __init__(self, fp_unit_cost: float = 50.0):
        self.fp_unit_cost = fp_unit_cost

    def calculate_cost(
        self, y_true: np.ndarray, y_prob: np.ndarray, threshold: float, amounts: np.ndarray
    ) -> dict:
        """
        Calculates costs, precision, recall, and f1 for a specific threshold.
        """
        y_pred = (y_prob >= threshold).astype(int)
        
        # Classification indices
        tp = int(np.sum((y_true == 1) & (y_pred == 1)))
        tn = int(np.sum((y_true == 0) & (y_pred == 0)))
        fp = int(np.sum((y_true == 0) & (y_pred == 1)))
        fn = int(np.sum((y_true == 1) & (y_pred == 0)))
        
        # Performance metrics
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
        
        # Business Costs
        fp_cost = fp * self.fp_unit_cost
        
        # FN Cost = Sum of amounts of transactions where y_true = 1 and y_pred = 0
        fn_mask = (y_true == 1) & (y_pred == 0)
        fn_cost = float(np.sum(amounts[fn_mask]))
        
        total_cost = fp_cost + fn_cost
        
        return {
            "threshold": threshold,
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "false_positives": fp,
            "false_negatives": fn,
            "fp_cost": fp_cost,
            "fn_cost": fn_cost,
            "total_cost": total_cost
        }

    def optimize_threshold(
        self, y_true: np.ndarray, y_prob: np.ndarray, amounts: np.ndarray
    ) -> tuple[float, pd.DataFrame]:
        """
        Evaluates thresholds [0.10, 0.20, ..., 0.90] on validation data and
        selects the one that minimizes the total expected loss.
        """
        thresholds = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
        results = []
        
        for t in thresholds:
            res = self.calculate_cost(y_true, y_prob, t, amounts)
            results.append(res)
            
        df_results = pd.DataFrame(results)
        
        # Select threshold with minimum total_cost
        best_row = df_results.loc[df_results["total_cost"].idxmin()]
        best_threshold = float(best_row["threshold"])
        
        return best_threshold, df_results

    def plot_cost_curve(self, df_results: pd.DataFrame, save_path: str):
        """Generates and saves a threshold vs business cost curve plot."""
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        
        plt.figure(figsize=(10, 6))
        plt.style.use('dark_background')
        
        # Set styling to match RazorGuard dashboard theme
        plt.plot(df_results["threshold"], df_results["total_cost"], color="#3b82f6", marker="o", linewidth=2, label="Total Cost")
        plt.plot(df_results["threshold"], df_results["fp_cost"], color="#eab308", linestyle="--", label="False Positive Cost")
        plt.plot(df_results["threshold"], df_results["fn_cost"], color="#ef4444", linestyle=":", label="False Negative Cost")
        
        plt.title("Threshold Optimization vs Business Cost", fontsize=14, color="white", pad=15)
        plt.xlabel("Classification Threshold", fontsize=12, color="#94a3b8")
        plt.ylabel("Expected Business Cost (₹)", fontsize=12, color="#94a3b8")
        plt.grid(True, color="#334155", linestyle="-", linewidth=0.5)
        plt.legend(loc="upper right", frameon=True, facecolor="#0f172a", edgecolor="#1e293b")
        
        # Highlight minimum point
        min_idx = df_results["total_cost"].idxmin()
        min_cost = df_results.loc[min_idx, "total_cost"]
        min_thresh = df_results.loc[min_idx, "threshold"]
        plt.annotate(
            f"Optimum Threshold: {min_thresh}\nCost: ₹{min_cost:,.2f}",
            xy=(min_thresh, min_cost),
            xytext=(min_thresh + 0.05, min_cost + (df_results["total_cost"].max() * 0.1)),
            arrowprops=dict(facecolor='#22c55e', shrink=0.05, width=1.5, headwidth=6),
            color="#22c55e",
            fontweight="bold"
        )
        
        plt.tight_layout()
        plt.savefig(save_path, dpi=150, facecolor="#0f172a")
        plt.close()
        print(f"Cost curve plot saved to: {save_path}")
