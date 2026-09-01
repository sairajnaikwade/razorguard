import asyncio
import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import async_session_factory
from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Demo users for all three RBAC roles
DEMO_USERS = [
    {
        "username": settings.ADMIN_USERNAME,
        "email": settings.ADMIN_EMAIL,
        "password": settings.ADMIN_PASSWORD,
        "role": "ADMIN",
    },
    {
        "username": "analyst",
        "email": "analyst@razorguard.com",
        "password": "RazorGuard-Analyst-2026!",
        "role": "ANALYST",
    },
    {
        "username": "viewer",
        "email": "viewer@razorguard.com",
        "password": "RazorGuard-Viewer-2026!",
        "role": "VIEWER",
    },
]


async def init_db() -> None:
    async with async_session_factory() as session:
        for u in DEMO_USERS:
            result = await session.execute(
                select(User).where(User.username == u["username"])
            )
            existing = result.scalar_one_or_none()

            if not existing:
                logger.info("Creating %s user '%s'...", u["role"], u["username"])
                user = User(
                    username=u["username"],
                    email=u["email"],
                    hashed_password=hash_password(u["password"]),
                    role=u["role"],
                    is_active=True,
                )
                session.add(user)
                await session.commit()
                logger.info("%s user '%s' created successfully.", u["role"], u["username"])
            else:
                logger.info("%s user '%s' already exists.", u["role"], u["username"])


if __name__ == "__main__":
    logger.info("Initializing database...")
    asyncio.run(init_db())
    logger.info("Database initialization complete.")
