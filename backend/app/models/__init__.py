"""Model registry — import all models so Alembic/Base.metadata can discover them."""

from app.models.base import Base
from app.models.user import User
from app.models.transaction import Transaction
from app.models.audit import AuditLog
from app.models.ai_report import AIReport

__all__ = ["Base", "User", "Transaction", "AuditLog", "AIReport"]
