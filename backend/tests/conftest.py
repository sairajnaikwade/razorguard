import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from fastapi import FastAPI
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher
import uuid

from app.main import app
from app.core.database import get_db
from app.models.base import Base
from app.models.user import User
from app.core.security import hash_password, create_access_token
from app.core.config import settings

# Test database
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=None,
)

TestingSessionLocal = async_sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def override_get_db():
    async with TestingSessionLocal() as session:
        yield session

app.dependency_overrides[get_db] = override_get_db

@pytest_asyncio.fixture(autouse=True)
async def db_schema():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest_asyncio.fixture
async def db_session() -> AsyncSession:
    async with TestingSessionLocal() as session:
        yield session

@pytest_asyncio.fixture
async def async_client() -> AsyncClient:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client

@pytest_asyncio.fixture
async def admin_user(db_session: AsyncSession):
    user = User(
        id=uuid.uuid4(),
        username="admin_test",
        email="admin_test@local.com",
        hashed_password=hash_password("admin_pass"),
        role="ADMIN",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    return user

@pytest_asyncio.fixture
async def analyst_user(db_session: AsyncSession):
    user = User(
        id=uuid.uuid4(),
        username="analyst_test",
        email="analyst_test@local.com",
        hashed_password=hash_password("analyst_pass"),
        role="ANALYST",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    return user

@pytest_asyncio.fixture
async def viewer_user(db_session: AsyncSession):
    user = User(
        id=uuid.uuid4(),
        username="viewer_test",
        email="viewer_test@local.com",
        hashed_password=hash_password("viewer_pass"),
        role="VIEWER",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    return user

@pytest.fixture
def admin_token(admin_user) -> str:
    return create_access_token(data={"sub": admin_user.username})

@pytest.fixture
def analyst_token(analyst_user) -> str:
    return create_access_token(data={"sub": analyst_user.username})

@pytest.fixture
def viewer_token(viewer_user) -> str:
    return create_access_token(data={"sub": viewer_user.username})
