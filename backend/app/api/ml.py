"""ML model status and metrics endpoints (read-only).

RBAC: all authenticated roles (ADMIN / ANALYST / VIEWER) may read.
"""

import logging

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder

from app.core.security import require_viewer
from app.schemas.ml import MLMetricsResponse, MLStatusResponse
from app.services.ml_service import (
    MLServiceUnavailable,
    get_default_service,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _unavailable_response():
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content=jsonable_encoder(
            {
                "status": "unavailable",
                "detail": "ML model artifacts could not be loaded.",
            }
        ),
    )


@router.get("/ml/status", response_model=MLStatusResponse, dependencies=[Depends(require_viewer)])
async def ml_status():
    """Report which model artifact is loaded and its locked threshold."""
    service = get_default_service()
    try:
        service.ensure_loaded()
    except MLServiceUnavailable as exc:
        logger.error("ML status unavailable: %s", exc)
        return _unavailable_response()

    info = service.describe()
    if info["status"] != "ready":
        return _unavailable_response()

    return MLStatusResponse(**info)


@router.get("/ml/metrics", response_model=MLMetricsResponse, dependencies=[Depends(require_viewer)])
async def ml_metrics():
    """
    Stored held-out evaluation metrics from model_metadata.json.

    These are computed once on the synthetic held-out test split; they are NOT
    recalculated per request and NOT live production performance.
    """
    service = get_default_service()
    try:
        service.ensure_loaded()
    except MLServiceUnavailable as exc:
        logger.error("ML metrics unavailable: %s", exc)
        return _unavailable_response()

    return MLMetricsResponse(**service.held_out_metrics())
