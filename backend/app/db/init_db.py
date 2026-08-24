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

async def init_db() -> None:
    async with async_session_factory() as session:
        # Check if admin user exists
        result = await session.execute(select(User).where(User.username == settings.ADMIN_USERNAME))
        user = result.scalar_one_or_none()
        
        if not user:
            logger.info("Creating default admin user...")
            admin_user = User(
                username=settings.ADMIN_USERNAME,
                email=settings.ADMIN_EMAIL,
                hashed_password=hash_password(settings.ADMIN_PASSWORD),
                role="ADMIN",
                is_active=True,
            )
            session.add(admin_user)
            await session.commit()
            logger.info("Default admin user created successfully.")
        else:
            logger.info("Admin user already exists.")

if __name__ == "__main__":
    logger.info("Initializing database...")
    asyncio.run(init_db())
    logger.info("Database initialization complete.")
