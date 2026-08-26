"""Audit event read API (Phase 4).

GET /api/audit?transaction_id=<id> — audit trail for one transaction,
newest first. Authenticated roles only (ADMIN / ANALYST / VIEWER).

Responses contain only curated, non-sensitive fields: event name, actor
username, transaction reference, timestamp and the non-secret metadata dict
written by app.services.audit_service. Passwords/tokens are never stored in
audit metadata, so they can never be exposed here.
"""

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_viewer
from app.models.audit import AuditLog
from app.models.user import User
from app.schemas.audit import AuditEventResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/audit",
    response_model=list[AuditEventResponse],
    dependencies=[Depends(require_viewer)],
)
async def list_audit_events(
    transaction_id: str = Query(..., min_length=1, description="Transaction ID to look up"),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return audit events for a transaction, newest first."""
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.transaction_id == transaction_id)
        .order_by(AuditLog.timestamp.desc(), AuditLog.id.desc())
        .limit(limit)
    )
    rows = result.scalars().all()
    return [
        AuditEventResponse(
            id=str(row.id),
            event=row.event,
            actor=row.actor,
            transaction_id=row.transaction_id,
            timestamp=row.timestamp,
            # ORM attribute is metadata_ (column name "metadata").
            metadata=row.metadata_,
        )
        for row in rows
    ]
