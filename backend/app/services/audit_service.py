"""
Audit logging service.

Records security-relevant events to the audit_logs table. The caller owns the
database session lifecycle: this module only adds rows so that persistence can
be committed atomically with the caller's own writes.

Never store passwords, tokens or secrets here. Store the minimum needed to
reconstruct who did what, when, with what outcome.
"""

import logging
from typing import Any, Dict, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog

logger = logging.getLogger(__name__)


async def record_audit_event(
    db: AsyncSession,
    *,
    event: str,
    actor: Optional[str] = None,
    transaction_id: Optional[str] = None,
    metadata_: Optional[Dict[str, Any]] = None,
    details: Optional[str] = None,
) -> AuditLog:
    """
    Append an AuditLog row to the session (without committing).

    event          short machine-readable name, e.g. "TRANSACTION_SCORED"
    actor          username performing the action (or "system")
    transaction_id related business transaction id, when applicable
    metadata_      small JSON dict of non-sensitive context
    details        optional free-text description
    """
    entry = AuditLog(
        event=event,
        actor=actor,
        transaction_id=transaction_id,
        metadata_=metadata_,
        details=details,
    )
    db.add(entry)
    return entry
