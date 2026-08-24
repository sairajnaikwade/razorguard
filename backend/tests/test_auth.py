import pytest
from httpx import AsyncClient
from app.models.user import User


@pytest.mark.asyncio
async def test_login_success(async_client: AsyncClient, admin_user: User):
    response = await async_client.post(
        "/api/auth/login",
        json={"username": admin_user.username, "password": "admin_pass"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["username"] == admin_user.username
    assert data["user"]["role"] == "ADMIN"

@pytest.mark.asyncio
async def test_login_invalid_password(async_client: AsyncClient, admin_user: User):
    response = await async_client.post(
        "/api/auth/login",
        json={"username": admin_user.username, "password": "wrong_password"}
    )
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_login_nonexistent_user(async_client: AsyncClient):
    response = await async_client.post(
        "/api/auth/login",
        json={"username": "nobody", "password": "password"}
    )
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_auth_me(async_client: AsyncClient, admin_token: str, admin_user: User):
    response = await async_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == admin_user.username
    assert data["role"] == "ADMIN"

@pytest.mark.asyncio
async def test_rbac_admin_access(async_client: AsyncClient, admin_token: str):
    response = await async_client.get(
        "/api/admin/stats",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    assert response.json()["access_level"] == "administrative"

@pytest.mark.asyncio
async def test_rbac_analyst_denied_admin(async_client: AsyncClient, analyst_token: str):
    response = await async_client.get(
        "/api/admin/stats",
        headers={"Authorization": f"Bearer {analyst_token}"}
    )
    assert response.status_code == 403

@pytest.mark.asyncio
async def test_rbac_analyst_allowed_analyst(async_client: AsyncClient, analyst_token: str):
    response = await async_client.get(
        "/api/analyst/overview",
        headers={"Authorization": f"Bearer {analyst_token}"}
    )
    assert response.status_code == 200
    assert response.json()["access_level"] == "analyst"

@pytest.mark.asyncio
async def test_rbac_viewer_allowed_viewer(async_client: AsyncClient, viewer_token: str):
    response = await async_client.get(
        "/api/system/info",
        headers={"Authorization": f"Bearer {viewer_token}"}
    )
    assert response.status_code == 200
    assert response.json()["access_level"] == "read-only"

@pytest.mark.asyncio
async def test_rbac_viewer_denied_analyst(async_client: AsyncClient, viewer_token: str):
    response = await async_client.get(
        "/api/analyst/overview",
        headers={"Authorization": f"Bearer {viewer_token}"}
    )
    assert response.status_code == 403

@pytest.mark.asyncio
async def test_invalid_token(async_client: AsyncClient):
    response = await async_client.get(
        "/api/system/info",
        headers={"Authorization": "Bearer invalid_token"}
    )
    assert response.status_code == 401
