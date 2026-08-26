"""Schemas for the audit event read API (Phase 4).

Audit events expose who did what, when — never secrets. The metadata payload
is curated at write time by app.services.audit_service and contains only
non-sensitive scoring context.
"""

from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel


class AuditEventResponse(BaseModel):
    id: str
    event: str
    actor: Optional[str] = None
    transaction_id: Optional[str] = None
    timestamp: datetime
    # Serialized under the public key "metadata"; populated from the ORM
    # attribute metadata_ by the API layer.
    metadata: Optional[Dict[str, Any]] = None
