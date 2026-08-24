"""Administrative and role-gated API routes."""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import require_admin, require_analyst, require_viewer
from app.models.user import User
from app.schemas.auth import UserResponse

router = APIRouter()


@router.get("/admin/users", dependencies=[Depends(require_admin)])
async def list_users(db: AsyncSession = Depends(get_db)):
    """ADMIN: list registered users."""
    result = await db.execute(select(User).order_by(User.username))
    users = result.scalars().all()
    return {"users": [UserResponse.model_validate(user) for user in users]}


@router.get("/admin/stats", dependencies=[Depends(require_admin)])
async def admin_stats(db: AsyncSession = Depends(get_db)):
    """ADMIN: administrative system statistics."""
    result = await db.execute(select(func.count()).select_from(User))
    user_count = result.scalar_one()
    return {"access_level": "administrative", "user_count": user_count}


@router.get("/analyst/overview", dependencies=[Depends(require_analyst)])
async def analyst_overview():
    """ANALYST: analyst workspace overview (placeholder for Phase 2)."""
    return {"access_level": "analyst", "status": "ready"}


@router.get("/system/info", dependencies=[Depends(require_viewer)])
async def system_info():
    """VIEWER: read-only system information."""
    return {"access_level": "read-only", "status": "ready"}
