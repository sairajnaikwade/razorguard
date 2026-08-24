"""Audit log model for tracking all system events."""

import uuid

from sqlalchemy import Column, DateTime, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSON as PG_JSON
from sqlalchemy import JSON
from sqlalchemy.sql import func

from app.models.base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    event = Column(String(100), nullable=False, index=True)
    actor = Column(String(255), nullable=True)
    transaction_id = Column(String(100), nullable=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    metadata_ = Column("metadata", JSON, nullable=True)
    details = Column(Text, nullable=True)

    def __repr__(self):
        return f"<AuditLog {self.event} actor={self.actor}>"
