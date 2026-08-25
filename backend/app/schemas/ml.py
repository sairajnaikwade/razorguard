"""Schemas for ML status and metrics endpoints."""

from typing import Any, Dict, Optional

from pydantic import BaseModel


class MLStatusResponse(BaseModel):
    status: str
    model_name: Optional[str] = None
    model_type: Optional[str] = None
    threshold: Optional[float] = None
    feature_count: int = 0
    model_version: Optional[str] = None
    # model_metadata.json contains no trained_at field; intentionally omitted.


class MLMetricsResponse(BaseModel):
    label: str
    note: str
    precision: Optional[float] = None
    recall: Optional[float] = None
    f1: Optional[float] = None
    roc_auc: Optional[float] = None
    pr_auc: Optional[float] = None
    true_positive: Optional[int] = None
    true_negative: Optional[int] = None
    false_positive: Optional[int] = None
    false_negative: Optional[int] = None
    false_positive_cost: Optional[float] = None
    false_negative_cost: Optional[float] = None
    total_expected_loss: Optional[float] = None
    threshold: Optional[float] = None
    extra: Dict[str, Any] = {}
