from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from redis.asyncio import Redis

from app.schemas.common import HealthResponse
from app.core.database import get_db
from app.core.config import settings
from app.services.ml_service import MLServiceUnavailable, get_default_service

router = APIRouter()

@router.get("/system/health", response_model=HealthResponse)
async def health_check(response: Response, db: AsyncSession = Depends(get_db)):
    db_status = "unhealthy"
    redis_status = "unhealthy"
    ml_status = "unavailable"

    # Check DB
    try:
        await db.execute(text("SELECT 1"))
        db_status = "healthy"
    except Exception:
        pass

    # Check Redis
    try:
        redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
        await redis.ping()
        redis_status = "healthy"
        await redis.close()
    except Exception:
        pass

    # Check ML artifacts (never crashes the endpoint; reports honestly)
    try:
        service = get_default_service()
        service.ensure_loaded()
        if service.is_ready:
            ml_status = "healthy"
    except (MLServiceUnavailable, Exception):
        ml_status = "unavailable"

    overall_status = (
        "healthy"
        if db_status == "healthy" and redis_status == "healthy" and ml_status == "healthy"
        else "degraded"
    )

    if overall_status != "healthy":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return HealthResponse(
        status=overall_status,
        database=db_status,
        redis=redis_status,
        ml_model=ml_status,
    )
