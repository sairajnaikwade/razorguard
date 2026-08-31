import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, ai_agent, audit, auth, health, ml, transactions
from app.core.config import settings
from app.services.ml_service import get_default_service

logger = logging.getLogger(__name__)

# Known insecure default — must never reach a production deployment unchanged.
_INSECURE_JWT_DEFAULT = "change-this-to-a-strong-random-secret-in-production"


def _assert_production_secrets() -> None:
    """
    Refuse to start in production with the known default JWT secret.
    Raises RuntimeError so the process exits with a non-zero code and
    leaves a clear message in the logs/container output.

    Only enforced when APP_ENV == "production".  Development and test
    environments are intentionally excluded so local setup stays frictionless.
    """
    if settings.APP_ENV.lower() == "production":
        if settings.JWT_SECRET_KEY == _INSECURE_JWT_DEFAULT:
            raise RuntimeError(
                "FATAL: JWT_SECRET_KEY is set to the known insecure default value. "
                "Set a strong random secret via the JWT_SECRET_KEY environment "
                "variable before running in production. "
                "Generate one with:  python -c \"import secrets; print(secrets.token_hex(32))\""
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup sequence:
      1. Enforce production-safety checks (fail fast on misconfiguration).
      2. Load ML artifacts (failure is non-fatal; health endpoint reports it).
    """
    _assert_production_secrets()

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
app.include_router(ai_agent.router, prefix="/api", tags=["AI Agent"])
