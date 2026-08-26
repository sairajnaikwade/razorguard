"""Unit tests for Phase 5 AI Investigation Agent APIs and caching."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import patch, MagicMock

from app.models.transaction import Transaction
from app.models.ai_report import AIReport
from app.models.audit import AuditLog
from app.services.ai_service import AIServiceError


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def seeded_transaction(db_session: AsyncSession) -> Transaction:
    """Seed a single transaction for testing AI reports."""
    tx = Transaction(
        transaction_id="TXN_TEST_AI_1",
        customer_id="CUST_AI_1",
        merchant_id="MERCH_AI_1",
        amount=25000.0,
        currency="INR",
        status="scored",
        device_id="DEV_AI_1",
        payment_method="card",
        country="IN",
        fraud_probability=0.75,
        risk_level="HIGH",
        decision="REVIEW",
        model_version="rf_v1",
        risk_signals=["New device", "High transaction velocity (last hour)"],
    )
    db_session.add(tx)
    await db_session.commit()
    return tx


class TestAIAgentAPI:
    @pytest.mark.asyncio
    async def test_post_requires_authentication(self, async_client: AsyncClient):
        response = await async_client.post("/api/transactions/TXN_TEST_AI_1/investigate")
        assert response.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_post_requires_analyst_role(
        self, async_client: AsyncClient, viewer_token: str, seeded_transaction
    ):
        # Viewer should be denied (403) from generating/triggering analysis
        response = await async_client.post(
            "/api/transactions/TXN_TEST_AI_1/investigate",
            headers=auth_headers(viewer_token)
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_post_unknown_transaction_returns_404(
        self, async_client: AsyncClient, analyst_token: str
    ):
        response = await async_client.post(
            "/api/transactions/TXN_NONEXISTENT/investigate",
            headers=auth_headers(analyst_token)
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_post_success_offline_mock_mode(
        self, async_client: AsyncClient, analyst_token: str, seeded_transaction, db_session: AsyncSession
    ):
        # Without GEMINI_API_KEY, should generate offline mock report
        response = await async_client.post(
            "/api/transactions/TXN_TEST_AI_1/investigate",
            headers=auth_headers(analyst_token)
        )
        assert response.status_code == 200
        body = response.json()

        assert body["is_mock"] is True
        assert "[OFFLINE MOCK]" in body["summary"]
        assert body["recommended_action"] == "REQUEST_VERIFICATION"  # HIGH risk -> REQUEST_VERIFICATION
        assert body["confidence"] == 0.85
        assert len(body["key_evidence"]) > 0

        # Verify it was persisted in the DB
        res = await db_session.execute(
            select(AIReport).where(AIReport.transaction_id == "TXN_TEST_AI_1")
        )
        saved = res.scalar_one_or_none()
        assert saved is not None
        assert saved.summary == body["summary"]

        # Verify audit trail event recorded
        audit_res = await db_session.execute(
            select(AuditLog)
            .where(AuditLog.transaction_id == "TXN_TEST_AI_1")
            .where(AuditLog.event == "AI_INVESTIGATION_GENERATED")
        )
        audit_event = audit_res.scalar_one_or_none()
        assert audit_event is not None
        assert audit_event.actor == "analyst_test"

    @pytest.mark.asyncio
    async def test_persistence_cache_hit(
        self, async_client: AsyncClient, analyst_token: str, seeded_transaction, db_session: AsyncSession
    ):
        # 1. First POST triggers initial generation
        await async_client.post(
            "/api/transactions/TXN_TEST_AI_1/investigate",
            headers=auth_headers(analyst_token)
        )

        # Retrieve creation timestamp
        res = await db_session.execute(
            select(AIReport).where(AIReport.transaction_id == "TXN_TEST_AI_1")
        )
        report_before = res.scalar_one()
        created_at_before = report_before.created_at

        # 2. Second POST without regenerate=True should reuse the cached model
        # We can temporarily patch the runner function to verify it is NOT called
        with patch("app.api.ai_agent.run_ai_investigation") as mock_run:
            response = await async_client.post(
                "/api/transactions/TXN_TEST_AI_1/investigate",
                headers=auth_headers(analyst_token)
            )
            assert response.status_code == 200
            assert mock_run.call_count == 0

        # 3. Third POST with regenerate=True should invoke it again
        with patch("app.api.ai_agent.run_ai_investigation") as mock_run:
            mock_run.return_value = MagicMock(
                summary="Regenerated report",
                key_evidence=["New key evidence"],
                risk_reasoning="New reasoning",
                recommended_action="ALLOW",
                confidence=0.99,
                limitations=[],
                is_mock=True
            )
            response = await async_client.post(
                "/api/transactions/TXN_TEST_AI_1/investigate?regenerate=true",
                headers=auth_headers(analyst_token)
            )
            assert response.status_code == 200
            assert mock_run.call_count == 1
            assert response.json()["summary"] == "Regenerated report"

    @pytest.mark.asyncio
    async def test_get_investigation_rbac_and_flow(
        self, async_client: AsyncClient, viewer_token: str, analyst_token: str, seeded_transaction, db_session: AsyncSession
    ):
        # 1. GET before creation returns 404
        response = await async_client.get(
            "/api/transactions/TXN_TEST_AI_1/investigate",
            headers=auth_headers(viewer_token)
        )
        assert response.status_code == 404

        # 2. Generate the report (Analyst required)
        await async_client.post(
            "/api/transactions/TXN_TEST_AI_1/investigate",
            headers=auth_headers(analyst_token)
        )

        # 3. GET after creation (Viewer is allowed to read)
        response = await async_client.get(
            "/api/transactions/TXN_TEST_AI_1/investigate",
            headers=auth_headers(viewer_token)
        )
        assert response.status_code == 200
        body = response.json()
        assert "[OFFLINE MOCK]" in body["summary"]

    @pytest.mark.asyncio
    @patch("app.api.ai_agent.run_ai_investigation")
    async def test_gemini_service_error_handling(
        self, mock_run, async_client: AsyncClient, analyst_token: str, seeded_transaction
    ):
        mock_run.side_effect = AIServiceError("Gemini quota exceeded")
        response = await async_client.post(
            "/api/transactions/TXN_TEST_AI_1/investigate",
            headers=auth_headers(analyst_token)
        )
        assert response.status_code == 502
        assert "Gemini quota exceeded" in response.json()["detail"]
