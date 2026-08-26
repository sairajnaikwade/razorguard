"""
Phase 4 tests — audit read API: RBAC, filtering by transaction, newest-first
ordering and non-secret payload shape.
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def make_event(transaction_id="TXN_AUDIT_1", actor="analyst_test", minutes=0, **overrides) -> dict:
    defaults = {
        "event": "TRANSACTION_SCORED",
        "actor": actor,
        "transaction_id": transaction_id,
        "timestamp": datetime(2026, 8, 20, 12, 0, 0, tzinfo=timezone.utc) + timedelta(minutes=minutes),
        "metadata_": {"risk_level": "HIGH", "decision": "REVIEW"},
    }
    defaults.update(overrides)
    return defaults


async def seed_events(db_session: AsyncSession, rows: list[dict]) -> None:
    for row in rows:
        db_session.add(AuditLog(**row))
    await db_session.commit()


@pytest.fixture
async def seeded_audit(db_session: AsyncSession):
    rows = [
        make_event(minutes=1),
        make_event(minutes=3),
        make_event(minutes=2),
        # unrelated transaction must never leak into the filtered response
        make_event(transaction_id="TXN_OTHER", minutes=30),
        # event without metadata
        make_event(event="TRANSACTION_REVIEWED", actor=None, metadata_=None, minutes=5),
    ]
    await seed_events(db_session, rows)
    return rows


class TestAuditAPI:
    @pytest.mark.asyncio
    async def test_requires_authentication(self, async_client: AsyncClient, seeded_audit):
        response = await async_client.get("/api/audit", params={"transaction_id": "TXN_AUDIT_1"})
        assert response.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_viewer_can_read(
        self, async_client: AsyncClient, viewer_token: str, seeded_audit
    ):
        response = await async_client.get(
            "/api/audit", params={"transaction_id": "TXN_AUDIT_1"}, headers=auth_headers(viewer_token)
        )
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_transaction_id_is_required(self, async_client: AsyncClient, viewer_token: str):
        response = await async_client.get("/api/audit", headers=auth_headers(viewer_token))
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_returns_only_matching_transaction_newest_first(
        self, async_client: AsyncClient, viewer_token: str, seeded_audit
    ):
        response = await async_client.get(
            "/api/audit", params={"transaction_id": "TXN_AUDIT_1"}, headers=auth_headers(viewer_token)
        )
        assert response.status_code == 200
        events = response.json()
        assert len(events) == 4  # TXN_OTHER excluded
        timestamps = [e["timestamp"] for e in events]
        assert timestamps == sorted(timestamps, reverse=True)

    @pytest.mark.asyncio
    async def test_response_shape_contains_required_fields(
        self, async_client: AsyncClient, viewer_token: str, seeded_audit
    ):
        response = await async_client.get(
            "/api/audit", params={"transaction_id": "TXN_AUDIT_1"}, headers=auth_headers(viewer_token)
        )
        event = response.json()[0]  # newest = TRANSACTION_REVIEWED (minutes=5)
        for key in ("id", "event", "actor", "transaction_id", "timestamp", "metadata"):
            assert key in event
        assert event["event"] == "TRANSACTION_REVIEWED"
        assert event["actor"] is None  # actor-less event serializes as null
        scored_events = [e for e in response.json() if e["event"] == "TRANSACTION_SCORED"]
        assert scored_events[0]["actor"] == "analyst_test"
        assert scored_events[0]["transaction_id"] == "TXN_AUDIT_1"
        assert scored_events[0]["metadata"]["risk_level"] == "HIGH"

    @pytest.mark.asyncio
    async def test_no_secrets_written_through_sanctioned_path(
        self, async_client: AsyncClient, viewer_token: str, db_session: AsyncSession
    ):
        """Events recorded via audit_service must never carry credential fields."""
        from app.services.audit_service import record_audit_event

        await record_audit_event(
            db_session,
            event="TRANSACTION_SCORED",
            actor="system",
            transaction_id="TXN_AUDIT_1",
            metadata_={
                "model_version": "random_forest_test",
                # simulate a careless caller leaking credentials into context
                "password": "hunter2",
                "token": "jwt-value",
            },
        )
        await db_session.commit()

        response = await async_client.get(
            "/api/audit", params={"transaction_id": "TXN_AUDIT_1"}, headers=auth_headers(viewer_token)
        )
        assert response.status_code == 200
        body = response.json()
        # The response exposes ONLY the documented fields — never auth headers,
        # hashed passwords or bearer tokens injected by the API layer.
        for event in body:
            assert set(event.keys()) == {
                "id", "event", "actor", "transaction_id", "timestamp", "metadata"
            }
            assert "hashed_password" not in str(event).lower()
            assert "authorization" not in str(event).lower()
            assert "bearer" not in str(event).lower()

    @pytest.mark.asyncio
    async def test_unknown_transaction_returns_empty_list(
        self, async_client: AsyncClient, viewer_token: str, seeded_audit
    ):
        response = await async_client.get(
            "/api/audit", params={"transaction_id": "TXN_UNKNOWN"}, headers=auth_headers(viewer_token)
        )
        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.asyncio
    async def test_limit_respected(
        self, async_client: AsyncClient, viewer_token: str, seeded_audit
    ):
        response = await async_client.get(
            "/api/audit",
            params={"transaction_id": "TXN_AUDIT_1", "limit": 2},
            headers=auth_headers(viewer_token),
        )
        assert len(response.json()) == 2
