"""
Minimal transaction model for Phase 1.

Designed for safe extension in Phase 2 via Alembic migration.
Phase 2 will add columns for:
  - device_id, ip_region, country, payment_method
  - failed_attempts, new_device, device_transaction_count
  - customer_account_age, historical_transaction_count
  - historical_average_amount, historical_failure_count
  - transactions_last_5m, transactions_last_1h, amount_last_1h
  - network_risk_indicator, unusual_country
  - payment_method_change, time_since_previous_transaction
  - fraud_probability, risk_level, is_fraud (label)
"""

import uuid
from sqlalchemy import Column, DateTime, Numeric, String, Uuid, Float
from sqlalchemy.sql import func

from app.models.base import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    transaction_id = Column(String(100), unique=True, nullable=False, index=True)
    customer_id = Column(String(100), nullable=False, index=True)
    merchant_id = Column(String(100), nullable=False, index=True)
    amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="INR")
    status = Column(String(20), nullable=False, default="pending")
    
    # ML Scoring Metadata & Outputs
    device_id = Column(String(100), nullable=True)
    payment_method = Column(String(50), nullable=True)
    country = Column(String(10), nullable=True)
    
    fraud_probability = Column(Float, nullable=True)
    risk_level = Column(String(20), nullable=True)
    decision = Column(String(20), nullable=True)
    model_version = Column(String(100), nullable=True)
    scored_at = Column(DateTime(timezone=True), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<Transaction {self.transaction_id} amount={self.amount} risk={self.risk_level}>"
