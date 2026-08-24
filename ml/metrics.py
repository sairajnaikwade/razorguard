import numpy as np
from sklearn.metrics import (
    precision_score, recall_score, f1_score, accuracy_score,
    roc_auc_score, precision_recall_curve, auc, confusion_matrix, roc_curve
)

def calculate_metrics(y_true: np.ndarray, y_pred: np.ndarray, y_prob: np.ndarray) -> dict:
    """
    Calculates standard binary classification metrics on predictions.
    """
    prec = precision_score(y_true, y_pred, zero_division=0)
    rec = recall_score(y_true, y_pred, zero_division=0)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    acc = accuracy_score(y_true, y_pred)
    
    # ROC-AUC and PR-AUC
    try:
        roc_auc = roc_auc_score(y_true, y_prob)
    except Exception:
        roc_auc = 0.5
        
    p, r, _ = precision_recall_curve(y_true, y_prob)
    pr_auc = auc(r, p)
    
    # Confusion Matrix
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    
    # Rates
    fpr = fp / (tn + fp) if (tn + fp) > 0 else 0.0
    fnr = fn / (tp + fn) if (tp + fn) > 0 else 0.0
    
    return {
        "accuracy": float(acc),
        "precision": float(prec),
        "recall": float(rec),
        "f1": float(f1),
        "roc_auc": float(roc_auc),
        "pr_auc": float(pr_auc),
        "fpr": float(fpr),
        "fnr": float(fnr),
        "tp": int(tp),
        "tn": int(tn),
        "fp": int(fp),
        "fn": int(fn)
    }

def get_roc_curve_data(y_true: np.ndarray, y_prob: np.ndarray) -> dict:
    """Generates false positive and true positive rates for plotting."""
    fpr, tpr, thresholds = roc_curve(y_true, y_prob)
    return {
        "fpr": fpr.tolist(),
        "tpr": tpr.tolist(),
        "thresholds": thresholds.tolist()
    }

def get_pr_curve_data(y_true: np.ndarray, y_prob: np.ndarray) -> dict:
    """Generates precision and recall coordinates for plotting."""
    prec, rec, thresholds = precision_recall_curve(y_true, y_prob)
    return {
        "precision": prec.tolist(),
        "recall": rec.tolist(),
        "thresholds": thresholds.tolist()
    }
