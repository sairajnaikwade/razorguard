import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, audit, auth, health, ml, transactions
from app.core.config import settings
from app.services.ml_service import get_default_service

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load ML artifacts once at startup; never retrain, never crash the app.

    If artifacts are missing/corrupted the app still boots so /api/system/health
    can report ml_model="unavailable" instead of silently pretending all is well.
    """
    service = get_default_service()
    try:
        service.load_artifacts()
    except Exception as exc:
        logger.error("ML artifacts failed to load at startup: %s", exc)
    yield


app = FastAPI(
    title="RazorGuard API",
    description="RazorGuard Payment Fraud Detection Platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(admin.router, prefix="/api", tags=["Admin"])
app.include_router(health.router, prefix="/api", tags=["System"])
app.include_router(transactions.router, prefix="/api", tags=["Transactions"])
app.include_router(ml.router, prefix="/api", tags=["ML"])
app.include_router(audit.router, prefix="/api", tags=["Audit"])
