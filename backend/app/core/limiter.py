"""
Redis-backed login rate limiter.

Strategy: per-IP sliding counter using Redis INCR + EXPIRE.
  - On the first attempt in a window, set the key and apply a TTL.
  - Each subsequent attempt within the window increments the counter.
  - Once the counter exceeds LOGIN_RATE_LIMIT_MAX, return HTTP 429.
  - If Redis is unavailable, fail open (allow the request) and log a warning.
    This keeps the service functional even when Redis is down, while still
    protecting against brute-force when Redis is healthy.

The limit is bypassed entirely when RATE_LIMIT_ENABLED=false (used in tests
and local development without Redis).
"""

import logging
from fastapi import HTTPException, Request, status
from redis.asyncio import Redis

from app.core.config import settings

logger = logging.getLogger(__name__)

_INSECURE_DEFAULT = "change-this-to-a-strong-random-secret-in-production"


async def login_rate_limit(request: Request) -> None:
    """
    FastAPI dependency — enforces per-IP login rate limiting.

    Inject on the login route:
        @router.post("/login", dependencies=[Depends(login_rate_limit)])
    """
    if not settings.RATE_LIMIT_ENABLED:
        return

    # Prefer X-Forwarded-For when behind a proxy; fall back to direct client IP.
    forwarded_for = request.headers.get("X-Forwarded-For")
    client_ip = forwarded_for.split(",")[0].strip() if forwarded_for else (
        request.client.host if request.client else "unknown"
    )

    key = f"ratelimit:login:{client_ip}"

    try:
        redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
        try:
            count = await redis.incr(key)
            if count == 1:
                # First attempt in this window — set expiry.
                await redis.expire(key, settings.LOGIN_RATE_LIMIT_WINDOW)
            if count > settings.LOGIN_RATE_LIMIT_MAX:
                ttl = await redis.ttl(key)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=(
                        f"Too many login attempts. "
                        f"Try again in {max(ttl, 1)} second(s)."
                    ),
                    headers={"Retry-After": str(max(ttl, 1))},
                )
        finally:
            await redis.aclose()
    except HTTPException:
        raise
    except Exception as exc:
        # Redis unavailable — fail open so login still works.
        logger.warning("Rate limiter Redis error (failing open): %s", exc)
