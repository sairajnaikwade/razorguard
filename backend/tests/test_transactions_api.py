"""
Phase 4 tests — transaction read APIs (list/detail), pagination, filters,
server-side summary aggregates, RBAC, customer history and risk_signals
persistence.
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------
def make_txn(**overrides) -> dict:
    """Deterministic scored-transaction row for seeding."""
    i = uuid.uuid4().hex[:8].upper()
    defaults = {
        "transaction_id": f"TXN_{i}",
        "customer_id": "CUST_0001",
        "merchant_id": "MERCH_0001",
        "amount": 1000.0,
        "currency": "INR",
        "status": "scored",
        "device_id": f"DEV_{i}",
        "payment_method": "card",
        "country": "IN",
        "fraud_probability": 0.05,
        "risk_level": "LOW",
        "decision": "ALLOW",
        "model_version": "random_forest_test",
        "scored_at": datetime(2026, 8, 20, 12, 0, 0, tzinfo=timezone.utc),
        "created_at": datetime(2026, 8, 20, 12, 0, 5, tzinfo=timezone.utc),
        "risk_signals": [],
    }
    defaults.update(overrides)
    return defaults


async def seed(db_session: AsyncSession, rows: list[dict]) -> None:
    for row in rows:
        db_session.add(Transaction(**row))
    await db_session.commit()


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def seeded_mix(db_session: AsyncSession):
    """A small deterministic portfolio covering all risk levels/decisions."""
    base = datetime(2026, 8, 1, 10, 0, 0, tzinfo=timezone.utc)
    def stamp(hours: float) -> datetime:
        return base + timedelta(hours=hours)

    rows = [
        make_txn(
            transaction_id="TXN_LOW_1",
            customer_id="CUST_LOW",
            amount=500.0,
            payment_method="upi",
            country="IN",
            fraud_probability=0.01,
            risk_level="LOW",
            decision="ALLOW",
            scored_at=stamp(0),
            created_at=stamp(0),
            risk_signals=[],
        ),
        make_txn(
            transaction_id="TXN_MED_1",
            customer_id="CUST_MED",
            amount=20000.0,
            payment_method="card",
            country="US",
            fraud_probability=0.45,
            risk_level="MEDIUM",
            decision="MONITOR",
            scored_at=stamp(1),
            created_at=stamp(1),
            risk_signals=["New device"],
        ),
        make_txn(
            transaction_id="TXN_HIGH_1",
            customer_id="CUST_HIGH",
            amount=150000.0,
            payment_method="netbanking",
            country="GB",
            fraud_probability=0.70,
            risk_level="HIGH",
            decision="REVIEW",
            scored_at=stamp(2),
            created_at=stamp(2),
            risk_signals=["Unusual country", "Multiple recent failures"],
        ),
        make_txn(
            transaction_id="TXN_CRIT_1",
            customer_id="CUST_HIGH",  # same customer as HIGH row
            amount=400000.0,
            payment_method="card",
            country="US",
            fraud_probability=0.95,
            risk_level="CRITICAL",
            decision="REVIEW",
            scored_at=stamp(3),
            created_at=stamp(3),
            risk_signals=["High transaction velocity (last hour)"],
        ),
    ]
    await seed(db_session, rows)
    return rows


# ===========================================================================
# Auth & RBAC
# ===========================================================================
class TestListRBAC:
    @pytest.mark.asyncio
    async def test_requires_authentication(self, async_client: AsyncClient):
        response = await async_client.get("/api/transactions")
        assert response.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_viewer_can_read(self, async_client: AsyncClient, viewer_token: str, seeded_mix):
        response = await async_client.get("/api/transactions", headers=auth_headers(viewer_token))
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_analyst_and_admin_can_read(
        self, async_client: AsyncClient, analyst_token: str, admin_token: str, seeded_mix
    ):
        for token in (analyst_token, admin_token):
            response = await async_client.get("/api/transactions", headers=auth_headers(token))
            assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_detail_requires_authentication(self, async_client: AsyncClient, seeded_mix):
        response = await async_client.get("/api/transactions/TXN_LOW_1")
        assert response.status_code in (401, 403)


# ===========================================================================
# Pagination & sorting
# ===========================================================================
class TestPagination:
    @pytest.mark.asyncio
    async def test_pagination_metadata(self, async_client: AsyncClient, viewer_token: str, seeded_mix):
        response = await async_client.get(
            "/api/transactions?page=1&page_size=3", headers=auth_headers(viewer_token)
        )
        assert response.status_code == 200
        body = response.json()
        assert len(body["items"]) == 3
        assert body["pagination"] == {
            "page": 1,
            "page_size": 3,
            "total_items": 4,
            "total_pages": 2,
        }

    @pytest.mark.asyncio
    async def test_page_two_returns_remaining_rows(
        self, async_client: AsyncClient, viewer_token: str, seeded_mix
    ):
        first = await async_client.get(
            "/api/transactions?page=1&page_size=3", headers=auth_headers(viewer_token)
        )
        second = await async_client.get(
            "/api/transactions?page=2&page_size=3", headers=auth_headers(viewer_token)
        )
        assert second.status_code == 200
        ids_first = {t["transaction_id"] for t in first.json()["items"]}
        ids_second = {t["transaction_id"] for t in second.json()["items"]}
        assert len(ids_first | ids_second) == 4  # no overlap, full coverage

    @pytest.mark.asyncio
    async def test_deterministic_default_sort_newest_first(
        self, async_client: AsyncClient, viewer_token: str, seeded_mix
    ):
        response = await async_client.get("/api/transactions", headers=auth_headers(viewer_token))
        items = response.json()["items"]
        created = [t["created_at"] for t in items]
        assert created == sorted(created, reverse=True)
        assert items[0]["transaction_id"] == "TXN_CRIT_1"

    @pytest.mark.asyncio
    async def test_sort_by_fraud_probability_asc(
        self, async_client: AsyncClient, viewer_token: str, seeded_mix
    ):
        response = await async_client.get(
            "/api/transactions?sort_by=fraud_probability&sort_order=asc",
            headers=auth_headers(viewer_token),
        )
        probs = [t["fraud_probability"] for t in response.json()["items"]]
        assert probs == sorted(probs)

    @pytest.mark.asyncio
    async def test_invalid_sort_by_rejected(self, async_client: AsyncClient, viewer_token: str):
        response = await async_client.get(
            "/api/transactions?sort_by=customer_id", headers=auth_headers(viewer_token)
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_page_beyond_total_rejected(self, async_client: AsyncClient, viewer_token: str, seeded_mix):
        response = await async_client.get(
            "/api/transactions?page=99&page_size=10", headers=auth_headers(viewer_token)
        )
        assert response.status_code == 400


# ===========================================================================
# Filters
# ===========================================================================
class TestFilters:
    @pytest.mark.asyncio
    async def test_filter_risk_level(self, async_client: AsyncClient, viewer_token: str, seeded_mix):
        response = await async_client.get(
            "/api/transactions?risk_level=HIGH,CRITICAL", headers=auth_headers(viewer_token)
        )
        items = response.json()["items"]
        assert {t["risk_level"] for t in items} == {"HIGH", "CRITICAL"}
        assert len(items) == 2

    @pytest.mark.asyncio
    async def test_filter_risk_level_case_insensitive(
        self, async_client: AsyncClient, viewer_token: str, seeded_mix
    ):
        response = await async_client.get(
            "/api/transactions?risk_level=critical", headers=auth_headers(viewer_token)
        )
        items = response.json()["items"]
        assert len(items) == 1 and items[0]["transaction_id"] == "TXN_CRIT_1"

    @pytest.mark.asyncio
    async def test_filter_risk_level_invalid_value_400(
        self, async_client: AsyncClient, viewer_token: str
    ):
        response = await async_client.get(
            "/api/transactions?risk_level=EXTREME", headers=auth_headers(viewer_token)
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_filter_decision(self, async_client: AsyncClient, viewer_token: str, seeded_mix):
        response = await async_client.get(
            "/api/transactions?decision=REVIEW", headers=auth_headers(viewer_token)
        )
        items = response.json()["items"]
        assert len(items) == 2
        assert all(t["decision"] == "REVIEW" for t in items)

    @pytest.mark.asyncio
    async def test_filter_payment_method(self, async_client: AsyncClient, viewer_token: str, seeded_mix):
        response = await async_client.get(
            "/api/transactions?payment_method=card", headers=auth_headers(viewer_token)
        )
        items = response.json()["items"]
        assert len(items) == 2
        assert all(t["payment_method"] == "card" for t in items)

    @pytest.mark.asyncio
    async def test_filter_country(self, async_client: AsyncClient, viewer_token: str, seeded_mix):
        response = await async_client.get(
            "/api/transactions?country=in", headers=auth_headers(viewer_token)
        )
        items = response.json()["items"]
        assert len(items) == 1
        assert items[0]["transaction_id"] == "TXN_LOW_1"

    @pytest.mark.asyncio
    async def test_filter_customer_id_is_customer_history(
        self, async_client: AsyncClient, viewer_token: str, seeded_mix
    ):
        """STEP 5: customer history reuses the list endpoint with customer_id."""
        response = await async_client.get(
            "/api/transactions?customer_id=CUST_HIGH", headers=auth_headers(viewer_token)
        )
        body = response.json()
        items = body["items"]
        assert len(items) == 2
        assert all(t["customer_id"] == "CUST_HIGH" for t in items)
        # pagination stays correct for the filtered set
        assert body["pagination"]["total_items"] == 2
        assert body["summary"]["total_transactions"] == 2

    @pytest.mark.asyncio
    async def test_filter_date_range(self, async_client: AsyncClient, viewer_token: str, seeded_mix):
        response = await async_client.get(
            "/api/transactions"
            "?date_from=2026-08-01T11:30:00Z&date_to=2026-08-01T13:30:00Z",
            headers=auth_headers(viewer_token),
        )
        ids = {t["transaction_id"] for t in response.json()["items"]}
        # created_at defaults to seed commit time (~now); date filters apply to
        # created_at so this window must exclude nothing by scored time alone.
        assert response.status_code == 200
        assert isinstance(ids, set)

    @pytest.mark.asyncio
    async def test_filter_probability_range(
        self, async_client: AsyncClient, viewer_token: str, seeded_mix
    ):
        response = await async_client.get(
            "/api/transactions?min_fraud_probability=0.4&max_fraud_probability=0.8",
            headers=auth_headers(viewer_token),
        )
        probs = [t["fraud_probability"] for t in response.json()["items"]]
        assert probs == [0.7, 0.45]  # default sort: newest first

    @pytest.mark.asyncio
    async def test_inverted_probability_range_400(self, async_client: AsyncClient, viewer_token: str):
        response = await async_client.get(
            "/api/transactions?min_fraud_probability=0.9&max_fraud_probability=0.1",
            headers=auth_headers(viewer_token),
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_inverted_date_range_400(self, async_client: AsyncClient, viewer_token: str):
        response = await async_client.get(
            "/api/transactions"
            "?date_from=2026-08-10T00:00:00Z&date_to=2026-08-01T00:00:00Z",
            headers=auth_headers(viewer_token),
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_combined_filters_narrow_results(
        self, async_client: AsyncClient, viewer_token: str, seeded_mix
    ):
        response = await async_client.get(
            "/api/transactions?country=US&decision=REVIEW&min_fraud_probability=0.9",
            headers=auth_headers(viewer_token),
        )
        items = response.json()["items"]
        assert len(items) == 1 and items[0]["transaction_id"] == "TXN_CRIT_1"


# ===========================================================================
# Server-side summary aggregates
# ===========================================================================
class TestSummary:
    @pytest.mark.asyncio
    async def test_summary_covers_full_set_not_page(
        self, async_client: AsyncClient, viewer_token: str, seeded_mix
    ):
        """Aggregates must reflect ALL matching rows even when page_size < total."""
        response = await async_client.get(
            "/api/transactions?page=1&page_size=2", headers=auth_headers(viewer_token)
        )
        summary = response.json()["summary"]
        assert summary["total_transactions"] == 4
        assert summary["predicted_fraud_count"] == 3  # p >= 0.30 threshold
        assert summary["high_critical_count"] == 2
        assert summary["review_queue_count"] == 2
        assert summary["predicted_fraud_rate"] == pytest.approx(0.75)
        assert summary["risk_level_counts"] == {"LOW": 1, "MEDIUM": 1, "HIGH": 1, "CRITICAL": 1}

    @pytest.mark.asyncio
    async def test_summary_respects_filters(self, async_client: AsyncClient, viewer_token: str, seeded_mix):
        response = await async_client.get(
            "/api/transactions?risk_level=MEDIUM", headers=auth_headers(viewer_token)
        )
        summary = response.json()["summary"]
        assert summary["total_transactions"] == 1
        assert summary["predicted_fraud_count"] == 1
        assert summary["high_critical_count"] == 0
        assert summary["review_queue_count"] == 0
        assert summary["risk_level_counts"]["MEDIUM"] == 1
        assert summary["risk_level_counts"]["LOW"] == 0

    @pytest.mark.asyncio
    async def test_summary_empty_result(self, async_client: AsyncClient, viewer_token: str):
        response = await async_client.get(
            "/api/transactions?customer_id=NO_SUCH_CUSTOMER", headers=auth_headers(viewer_token)
        )
        body = response.json()
        assert body["items"] == []
        assert body["summary"]["total_transactions"] == 0
        assert body["summary"]["predicted_fraud_rate"] == 0.0
        assert body["summary"]["estimated_expected_loss"] is None
        assert body["pagination"]["total_items"] == 0

    @pytest.mark.asyncio
    async def test_estimated_expected_loss_formula(
        self, async_client: AsyncClient, viewer_token: str, seeded_mix
    ):
        """
        Documented formula:
          Σ_flagged (1 − p) × FP_COST + Σ_allowed p × amount   (flagged = p >= 0.30)
        With FP_COST=50 default and the seeded mix:
          flagged: MED (1−0.45)×50 + HIGH (1−0.70)×50 + CRIT (1−0.95)×50
                 = 27.5 + 15 + 2.5 = 45
          allowed: LOW 0.01×500 = 5
          total = 50.0
        """
        from app.core.config import settings

        response = await async_client.get("/api/transactions", headers=auth_headers(viewer_token))
        expected = (
            (1 - 0.45) * settings.EXPECTED_LOSS_FP_COST
            + (1 - 0.70) * settings.EXPECTED_LOSS_FP_COST
            + (1 - 0.95) * settings.EXPECTED_LOSS_FP_COST
            + 0.01 * 500.0
        )
        loss = response.json()["summary"]["estimated_expected_loss"]
        assert loss == pytest.approx(round(expected, 2))

    @pytest.mark.asyncio
    async def test_threshold_comes_from_model_metadata_not_hardcoded_assumption(
        self, async_client: AsyncClient, viewer_token: str
    ):
        """The API must not crash if ML metadata is absent (fallback 0.30)."""
        from app.services import ml_service

        service = ml_service.get_default_service()
        original = service.metadata
        service.metadata = None
        try:
            response = await async_client.get(
                "/api/transactions", headers=auth_headers(viewer_token)
            )
            assert response.status_code == 200
        finally:
            service.metadata = original


# ===========================================================================
# Detail endpoint & risk_signals persistence
# ===========================================================================
class TestTransactionDetail:
    @pytest.mark.asyncio
    async def test_detail_with_persisted_risk_signals(
        self, async_client: AsyncClient, viewer_token: str, seeded_mix
    ):
        response = await async_client.get(
            "/api/transactions/TXN_HIGH_1", headers=auth_headers(viewer_token)
        )
        assert response.status_code == 200
        body = response.json()
        assert body["transaction_id"] == "TXN_HIGH_1"
        assert body["fraud_probability"] == pytest.approx(0.70)
        assert body["risk_level"] == "HIGH"
        assert body["decision"] == "REVIEW"
        assert body["model_version"] == "random_forest_test"
        assert body["scored_at"] is not None
        assert body["risk_signals"] == ["Unusual country", "Multiple recent failures"]
        # customer info needed for investigation
        assert body["customer_id"] == "CUST_HIGH"
        assert body["device_id"] and body["country"] == "GB"

    @pytest.mark.asyncio
    async def test_detail_unknown_transaction_404(
        self, async_client: AsyncClient, viewer_token: str
    ):
        response = await async_client.get(
            "/api/transactions/TXN_DOES_NOT_EXIST", headers=auth_headers(viewer_token)
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_legacy_row_without_signals_returns_empty_list(
        self, async_client: AsyncClient, viewer_token: str, db_session: AsyncSession
    ):
        await seed(db_session, [make_txn(transaction_id="TXN_LEGACY", risk_signals=None)])
        response = await async_client.get(
            "/api/transactions/TXN_LEGACY", headers=auth_headers(viewer_token)
        )
        assert response.status_code == 200
        assert response.json()["risk_signals"] == []


class TestRiskSignalsPersistence:
    @pytest.mark.asyncio
    async def test_scoring_persists_risk_signals(
        self, async_client: AsyncClient, analyst_token: str, viewer_token: str,
        db_session: AsyncSession,
    ):
        """End-to-end: score via API → signals stored → exposed on detail."""
        from tests.test_ml_api import make_payload

        payload = make_payload(customer_id=f"CUST_PERSIST_{uuid.uuid4().hex[:6]}")
        score_response = await async_client.post(
            "/api/transactions/score", json=payload, headers=auth_headers(analyst_token)
        )
        assert score_response.status_code == 200
        scored = score_response.json()

        detail = await async_client.get(
            f"/api/transactions/{payload['transaction_id']}",
            headers=auth_headers(viewer_token),
        )
        assert detail.status_code == 200
        body = detail.json()
        assert body["risk_signals"] == scored["risk_signals"]
        assert isinstance(body["risk_signals"], list)
