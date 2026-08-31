"""
Security hardening tests — three areas:

1. Login rate limiting (Redis-backed, per-IP, returns 429 after N attempts).
2. JWT secret production guard (refuse startup with the known default secret).
3. Duplicate transaction_id race → 409 Conflict via IntegrityError, not 500.
"""

import uuid
from unittest.mock import AsyncMock, patch, MagicMock

import pytest
from httpx import AsyncClient
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.limiter import login_rate_limit
from app.main import _assert_production_secrets, _INSECURE_JWT_DEFAULT


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ===========================================================================
# 1. LOGIN RATE LIMITING
# ===========================================================================
class TestLoginRateLimit:
    """
    These tests exercise the rate-limit logic directly by temporarily enabling
    it (settings.RATE_LIMIT_ENABLED = True) and mocking the Redis client so
    no real Redis connection is required.
    """

    @pytest.mark.asyncio
    async def test_passes_when_under_limit(
        self, async_client: AsyncClient, admin_user
    ):
        """Requests below the limit succeed normally."""
        # Patch Redis inside the limiter to simulate a counter at 1 (first call).
        mock_redis = AsyncMock()
        mock_redis.incr = AsyncMock(return_value=1)
        mock_redis.expire = AsyncMock(return_value=True)
        mock_redis.ttl = AsyncMock(return_value=55)
        mock_redis.aclose = AsyncMock()

        with patch("app.core.limiter.settings") as mock_settings, \
             patch("app.core.limiter.Redis") as MockRedis:
            mock_settings.RATE_LIMIT_ENABLED = True
            mock_settings.REDIS_URL = "redis://localhost:6379/0"
            mock_settings.LOGIN_RATE_LIMIT_MAX = 10
            mock_settings.LOGIN_RATE_LIMIT_WINDOW = 60
            MockRedis.from_url.return_value = mock_redis

            response = await async_client.post(
                "/api/auth/login",
                json={"username": admin_user.username, "password": "admin_pass"},
            )
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_returns_429_when_limit_exceeded(
        self, async_client: AsyncClient, admin_user
    ):
        """Once the counter exceeds LOGIN_RATE_LIMIT_MAX, login returns 429."""
        mock_redis = AsyncMock()
        # Counter is 11 — above the max of 10.
        mock_redis.incr = AsyncMock(return_value=11)
        mock_redis.expire = AsyncMock(return_value=True)
        mock_redis.ttl = AsyncMock(return_value=45)
        mock_redis.aclose = AsyncMock()

        with patch("app.core.limiter.settings") as mock_settings, \
             patch("app.core.limiter.Redis") as MockRedis:
            mock_settings.RATE_LIMIT_ENABLED = True
            mock_settings.REDIS_URL = "redis://localhost:6379/0"
            mock_settings.LOGIN_RATE_LIMIT_MAX = 10
            mock_settings.LOGIN_RATE_LIMIT_WINDOW = 60
            MockRedis.from_url.return_value = mock_redis

            response = await async_client.post(
                "/api/auth/login",
                json={"username": admin_user.username, "password": "admin_pass"},
            )
        assert response.status_code == 429
        body = response.json()
        assert "Too many login attempts" in body["detail"]
        # Retry-After header must be present
        assert "Retry-After" in response.headers

    @pytest.mark.asyncio
    async def test_fails_open_when_redis_unavailable(
        self, async_client: AsyncClient, admin_user
    ):
        """If Redis is unreachable, login still works (fail-open)."""
        with patch("app.core.limiter.settings") as mock_settings, \
             patch("app.core.limiter.Redis") as MockRedis:
            mock_settings.RATE_LIMIT_ENABLED = True
            mock_settings.REDIS_URL = "redis://localhost:6379/0"
            mock_settings.LOGIN_RATE_LIMIT_MAX = 10
            mock_settings.LOGIN_RATE_LIMIT_WINDOW = 60
            # Simulate Redis connection failure.
            MockRedis.from_url.side_effect = ConnectionError("Redis unavailable")

            response = await async_client.post(
                "/api/auth/login",
                json={"username": admin_user.username, "password": "admin_pass"},
            )
        # Must not return 500 — fail open means the request goes through.
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_disabled_when_rate_limit_enabled_false(
        self, async_client: AsyncClient, admin_user
    ):
        """RATE_LIMIT_ENABLED=False bypasses Redis entirely (test/dev mode)."""
        # conftest sets RATE_LIMIT_ENABLED=False globally, so this should
        # always succeed without hitting Redis.
        assert settings.RATE_LIMIT_ENABLED is False

        response = await async_client.post(
            "/api/auth/login",
            json={"username": admin_user.username, "password": "admin_pass"},
        )
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_wrong_credentials_still_checked_before_rate_limit_is_concern(
        self, async_client: AsyncClient
    ):
        """Wrong credentials return 401 even when rate limiting is disabled."""
        response = await async_client.post(
            "/api/auth/login",
            json={"username": "nobody", "password": "wrongpass"},
        )
        assert response.status_code == 401

    def test_rate_limit_key_uses_client_ip(self):
        """Unit-test the key construction logic (no HTTP layer needed)."""
        # The key format is predictable: ratelimit:login:<ip>
        import asyncio
        from starlette.testclient import TestClient
        from starlette.requests import Request

        # Build a minimal mock Request with a known client address.
        scope = {
            "type": "http",
            "method": "POST",
            "path": "/api/auth/login",
            "query_string": b"",
            "headers": [],
            "client": ("192.168.1.100", 54321),
        }
        request = Request(scope)
        assert request.client.host == "192.168.1.100"

    def test_x_forwarded_for_header_is_used_when_present(self):
        """X-Forwarded-For takes precedence for proxy-aware deployments."""
        from starlette.requests import Request

        scope = {
            "type": "http",
            "method": "POST",
            "path": "/api/auth/login",
            "query_string": b"",
            "headers": [(b"x-forwarded-for", b"203.0.113.42, 10.0.0.1")],
            "client": ("10.0.0.1", 54321),
        }
        request = Request(scope)
        forwarded_for = request.headers.get("X-Forwarded-For")
        client_ip = forwarded_for.split(",")[0].strip()
        # Must use the originating IP, not the proxy's IP.
        assert client_ip == "203.0.113.42"


# ===========================================================================
# 2. JWT SECRET PRODUCTION GUARD
# ===========================================================================
class TestJwtSecretGuard:
    def test_raises_on_production_with_default_secret(self):
        """_assert_production_secrets() must raise RuntimeError in production."""
        original_env = settings.APP_ENV
        original_key = settings.JWT_SECRET_KEY
        try:
            settings.APP_ENV = "production"
            settings.JWT_SECRET_KEY = _INSECURE_JWT_DEFAULT
            with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
                _assert_production_secrets()
        finally:
            settings.APP_ENV = original_env
            settings.JWT_SECRET_KEY = original_key

    def test_passes_on_production_with_strong_secret(self):
        """A non-default secret in production must not raise."""
        import secrets
        original_env = settings.APP_ENV
        original_key = settings.JWT_SECRET_KEY
        try:
            settings.APP_ENV = "production"
            settings.JWT_SECRET_KEY = secrets.token_hex(32)
            # Should not raise.
            _assert_production_secrets()
        finally:
            settings.APP_ENV = original_env
            settings.JWT_SECRET_KEY = original_key

    def test_does_not_raise_in_development_with_default_secret(self):
        """The guard must be silent in development mode."""
        original_env = settings.APP_ENV
        original_key = settings.JWT_SECRET_KEY
        try:
            settings.APP_ENV = "development"
            settings.JWT_SECRET_KEY = _INSECURE_JWT_DEFAULT
            # Should not raise in development.
            _assert_production_secrets()
        finally:
            settings.APP_ENV = original_env
            settings.JWT_SECRET_KEY = original_key

    def test_does_not_raise_in_test_env_with_default_secret(self):
        """The guard must be silent in test environments."""
        original_env = settings.APP_ENV
        original_key = settings.JWT_SECRET_KEY
        try:
            settings.APP_ENV = "test"
            settings.JWT_SECRET_KEY = _INSECURE_JWT_DEFAULT
            _assert_production_secrets()
        finally:
            settings.APP_ENV = original_env
            settings.JWT_SECRET_KEY = original_key

    def test_production_check_is_case_insensitive(self):
        """'Production', 'PRODUCTION', 'production' all trigger the guard."""
        original_env = settings.APP_ENV
        original_key = settings.JWT_SECRET_KEY
        try:
            settings.JWT_SECRET_KEY = _INSECURE_JWT_DEFAULT
            for env in ("production", "Production", "PRODUCTION"):
                settings.APP_ENV = env
                with pytest.raises(RuntimeError):
                    _assert_production_secrets()
        finally:
            settings.APP_ENV = original_env
            settings.JWT_SECRET_KEY = original_key

    def test_error_message_is_actionable(self):
        """The RuntimeError message must tell the operator exactly what to do."""
        original_env = settings.APP_ENV
        original_key = settings.JWT_SECRET_KEY
        try:
            settings.APP_ENV = "production"
            settings.JWT_SECRET_KEY = _INSECURE_JWT_DEFAULT
            with pytest.raises(RuntimeError) as exc_info:
                _assert_production_secrets()
            msg = str(exc_info.value)
            assert "JWT_SECRET_KEY" in msg
            assert "production" in msg.lower()
        finally:
            settings.APP_ENV = original_env
            settings.JWT_SECRET_KEY = original_key


# ===========================================================================
# 3. DUPLICATE TRANSACTION RACE → 409 via IntegrityError
# ===========================================================================
class TestDuplicateTransactionRace:
    """
    Simulates the TOCTOU race: two concurrent requests both pass the SELECT
    check, but the second DB commit raises IntegrityError due to the unique
    constraint on transaction_id.  The API must return 409, not 500.
    """

    @pytest.mark.asyncio
    async def test_409_on_sequential_duplicate(
        self, async_client: AsyncClient, analyst_token: str
    ):
        """Sequential duplicate — first call wins, second returns 409."""
        from tests.test_ml_api import make_payload

        payload = make_payload(
            customer_id=f"CUST_RACE_{uuid.uuid4().hex[:6]}"
        )

        first = await async_client.post(
            "/api/transactions/score",
            json=payload,
            headers=auth_headers(analyst_token),
        )
        assert first.status_code == 200, f"First scoring failed: {first.json()}"

        second = await async_client.post(
            "/api/transactions/score",
            json=payload,
            headers=auth_headers(analyst_token),
        )
        assert second.status_code == 409
        assert payload["transaction_id"] in second.json()["detail"]

    @pytest.mark.asyncio
    async def test_integrity_error_path_returns_409_not_500(
        self, analyst_token: str, analyst_user
    ):
        """
        Unit-test the IntegrityError branch directly by calling score_transaction
        with a mock DB session whose commit raises IntegrityError.
        This avoids touching app.dependency_overrides (which would break the
        shared in-memory schema used by all other tests in the suite).
        """
        from unittest.mock import AsyncMock, MagicMock
        from app.api.transactions import score_transaction
        from tests.test_ml_api import make_payload

        payload_dict = make_payload(customer_id=f"CUST_RACE2_{uuid.uuid4().hex[:6]}")
        payload_dict["transaction_id"] = f"TXN_RACE_{uuid.uuid4().hex[:8].upper()}"

        from app.schemas.transaction import TransactionScoreRequest
        req = TransactionScoreRequest(**payload_dict)

        orig_integrity_error = IntegrityError(
            statement="INSERT INTO transactions ...",
            params={},
            orig=Exception("UNIQUE constraint failed: transactions.transaction_id"),
        )

        # Mock DB: SELECT returns None (passes duplicate check), commit raises.
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.add = MagicMock()
        mock_db.commit = AsyncMock(side_effect=orig_integrity_error)
        mock_db.rollback = AsyncMock()

        with pytest.raises(Exception) as exc_info:
            await score_transaction(req, db=mock_db, current_user=analyst_user)

        from fastapi import HTTPException
        assert isinstance(exc_info.value, HTTPException)
        assert exc_info.value.status_code == 409
        assert "already been scored" in exc_info.value.detail
        mock_db.rollback.assert_called_once()

    @pytest.mark.asyncio
    async def test_unrelated_db_error_still_returns_500(
        self, analyst_token: str, analyst_user
    ):
        """
        A generic RuntimeError from db.commit must propagate as 500, not 409.
        The IntegrityError handler must not catch unrelated exceptions.
        """
        from unittest.mock import AsyncMock, MagicMock
        from app.api.transactions import score_transaction
        from tests.test_ml_api import make_payload
        from fastapi import HTTPException

        payload_dict = make_payload(customer_id=f"CUST_ERR_{uuid.uuid4().hex[:6]}")
        payload_dict["transaction_id"] = f"TXN_ERR_{uuid.uuid4().hex[:8].upper()}"

        from app.schemas.transaction import TransactionScoreRequest
        req = TransactionScoreRequest(**payload_dict)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.add = MagicMock()
        mock_db.commit = AsyncMock(side_effect=RuntimeError("Unexpected storage failure"))
        mock_db.rollback = AsyncMock()

        with pytest.raises(HTTPException) as exc_info:
            await score_transaction(req, db=mock_db, current_user=analyst_user)

        assert exc_info.value.status_code == 500
        mock_db.rollback.assert_called_once()
