from pydantic import BaseModel, Field, field_validator
from typing import Dict, List, Optional
from datetime import datetime
from uuid import UUID

def _validate_iso_timestamp(value: str) -> str:
    """Ensure the timestamp is parseable ISO 8601 (naive or tz-aware)."""
    from datetime import datetime as _dt

    try:
        _dt.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        raise ValueError("timestamp must be an ISO 8601 string")
    return value

class TransactionScoreRequest(BaseModel):
    transaction_id: str = Field(..., description="Unique transaction ID from the client/gateway")
    customer_id: str = Field(..., description="Unique customer ID")
    merchant_id: str = Field(..., description="Unique merchant ID")
    amount: float = Field(..., gt=0, description="Transaction amount (must be positive)")
    currency: str = Field("INR", min_length=3, max_length=3, description="Currency code (e.g. INR)")
    timestamp: str = Field(..., description="ISO 8601 formatted transaction timestamp")
    payment_method: str = Field(..., description="UPI | card | netbanking")
    device_id: str = Field(..., description="Device identifier")
    country: str = Field(..., min_length=2, max_length=2, description="Two-letter country code")
    ip_region: str = Field(..., description="IP region string")
    customer_account_age: int = Field(..., ge=0, description="Age of the customer account in days")
    historical_transaction_count: int = Field(..., ge=0, description="Total prior transaction count")
    historical_failure_count: int = Field(..., ge=0, description="Total prior transaction failure count")
    failed_attempts: int = Field(..., ge=0, description="Failed attempts immediately preceding this transaction")
    new_device: int = Field(..., ge=0, le=1, description="1 if new device, 0 otherwise")
    unusual_country: int = Field(..., ge=0, le=1, description="1 if country is unusual, 0 otherwise")
    payment_method_change: int = Field(..., ge=0, le=1, description="1 if payment method changed, 0 otherwise")

    _timestamp_check = field_validator("timestamp")(_validate_iso_timestamp)

    model_config = {
        "json_schema_extra": {
            "example": {
                "transaction_id": "TXN_9988776655AA",
                "customer_id": "CUST_0042",
                "merchant_id": "MERCH_0010",
                "amount": 240000.0,
                "currency": "INR",
                "timestamp": "2026-08-24T23:00:00.000Z",
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
                "payment_method_change": 1
            }
        }
    }


class TransactionScoreResponse(BaseModel):
    transaction_id: str
    fraud_probability: float
    risk_level: str
    threshold: float
    decision: str
    risk_signals: List[str]
    model_version: str
    scored_at: datetime

    model_config = {
        "from_attributes": True
    }


class TransactionDetailsResponse(BaseModel):
    id: str
    transaction_id: str
    customer_id: str
    merchant_id: str
    amount: float
    currency: str
    status: str
    device_id: Optional[str] = None
    payment_method: Optional[str] = None
    country: Optional[str] = None
    fraud_probability: Optional[float] = None
    risk_level: Optional[str] = None
    decision: Optional[str] = None
    model_version: Optional[str] = None
    scored_at: Optional[datetime] = None
    created_at: datetime

    model_config = {
        "from_attributes": True
    }


# ---------------------------------------------------------------------------
# Phase 4 — read APIs (list / detail / summary)
# ---------------------------------------------------------------------------

class TransactionRead(BaseModel):
    """Single transaction row as returned by list endpoints."""
    id: UUID
    transaction_id: str
    customer_id: str
    merchant_id: str
    amount: float
    currency: str
    status: str
    device_id: Optional[str] = None
    payment_method: Optional[str] = None
    country: Optional[str] = None
    fraud_probability: Optional[float] = None
    risk_level: Optional[str] = None
    decision: Optional[str] = None
    model_version: Optional[str] = None
    scored_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TransactionDetailResponse(TransactionRead):
    """Full investigation view for a single transaction."""
    risk_signals: List[str] = []
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

    @field_validator("risk_signals", mode="before")
    @classmethod
    def _none_to_empty_list(cls, value):
        """Rows scored before persistence existed store NULL signals."""
        return value or []


class PaginationMeta(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int


class TransactionSummary(BaseModel):
    """
    Server-side aggregates computed over the FULL filtered result set
    (never just the current page).

    Terminology:
      - "predicted" counts are model outputs, NOT confirmed fraud labels.
      - estimated_expected_loss is a modeled estimate, NOT confirmed loss.
    """
    total_transactions: int
    predicted_fraud_count: int
    high_critical_count: int
    review_queue_count: int
    predicted_fraud_rate: float
    risk_level_counts: Dict[str, int]
    estimated_expected_loss: Optional[float] = None
    expected_loss_currency: str = "INR"


class TransactionListResponse(BaseModel):
    items: List[TransactionRead]
    pagination: PaginationMeta
    summary: TransactionSummary
