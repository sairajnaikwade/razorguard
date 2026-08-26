"""
RazorGuard application settings.
All secrets and configuration are loaded from environment variables.
"""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent
BACKEND_DIR = ROOT_DIR / "backend"


def _resolve_env_files() -> tuple[str, ...]:
    candidates = (ROOT_DIR / ".env", BACKEND_DIR / ".env")
    return tuple(str(path) for path in candidates if path.is_file())


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://razorguard:razorguard@localhost:5432/razorguard"
    DATABASE_URL_SYNC: str = "postgresql://razorguard:razorguard@localhost:5432/razorguard"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT — secret MUST be overridden via env var in production
    JWT_SECRET_KEY: str = "change-this-to-a-strong-random-secret-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Default admin — credentials from environment, never hardcoded
    ADMIN_USERNAME: str = "admin"
    ADMIN_EMAIL: str = "admin@razorguard.local"
    ADMIN_PASSWORD: str = "change-this-admin-password"

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # App
    APP_ENV: str = "development"

    # Expected-loss estimation (live dashboard) — business cost assumptions.
    # Mirrors ml/threshold.py BusinessCostModel: a flagged (non-ALLOW)
    # transaction carries an analyst review cost when it turns out legitimate;
    # an allowed transaction risks losing its full amount if it is fraudulent.
    # Override via environment variable in deployments.
    EXPECTED_LOSS_FP_COST: float = 50.0

    model_config = SettingsConfigDict(
        env_file=_resolve_env_files() or (".env",),
        extra="ignore",
    )


settings = Settings()
