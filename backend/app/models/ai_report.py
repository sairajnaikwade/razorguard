"""AI report model for caching investigation outputs (Phase 5)."""

import uuid

from sqlalchemy import Boolean, Column, DateTime, Float, String, Text, Uuid, JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.models.base import Base

# JSONB on PostgreSQL, plain JSON elsewhere (e.g. SQLite test database).
JSONField = JSONB().with_variant(JSON(), "sqlite")


class AIReport(Base):
    __tablename__ = "ai_reports"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    transaction_id = Column(String(100), unique=True, nullable=False, index=True)
    summary = Column(Text, nullable=False)
    key_evidence = Column(JSONField, nullable=False)
    risk_reasoning = Column(Text, nullable=False)
    recommended_action = Column(String(100), nullable=False)
    confidence = Column(Float, nullable=False)
    limitations = Column(JSONField, nullable=False)
    is_mock = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<AIReport txn={self.transaction_id} confidence={self.confidence}>"
