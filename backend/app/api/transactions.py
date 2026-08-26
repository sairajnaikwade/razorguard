"""Transaction fraud-scoring and read APIs.

POST /api/transactions/score — score a transaction with the verified Random
Forest detector, persist the result (including risk signals) and write an
audit event.

GET  /api/transactions              — paginated, filterable transaction list
                                      with server-side summary aggregates.
GET  /api/transactions/{id}         — full investigation detail for one
                                      transaction.

RBAC: ADMIN and ANALYST may score. ADMIN / ANALYST / VIEWER may read.
The backend is the single source of truth: all aggregates are computed
server-side over the FULL filtered set, never from a single page.
"""

import logging
import math
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import require_analyst, get_current_user, require_viewer
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.transaction import (
    PaginationMeta,
    TransactionDetailResponse,
    TransactionListResponse,
    TransactionScoreRequest,
    TransactionScoreResponse,
    TransactionRead,
    TransactionSummary,
)
from app.services.audit_service import record_audit_event
from app.services.ml_service import (
    MLServiceUnavailable,
    PredictionError,
    get_default_service,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Fallback if ML metadata is not loaded; matches the locked model threshold.
FALLBACK_THRESHOLD = 0.30
RISK_LEVELS = ("LOW", "MEDIUM", "HIGH", "CRITICAL")
SORTABLE_COLUMNS = {
    "created_at": Transaction.created_at,
    "scored_at": Transaction.scored_at,
    "amount": Transaction.amount,
    "fraud_probability": Transaction.fraud_probability,
}


def _selected_threshold() -> float:
    """Locked decision threshold from loaded ML metadata (never tuned here)."""
    service = get_default_service()
    raw = (service.metadata or {}).get("selected_threshold")
    try:
        return float(raw)
    except (TypeError, ValueError):
        return FALLBACK_THRESHOLD


def _csv_filter(values: Optional[str], allowed) -> Optional[List[str]]:
    """Parse a comma-separated query param into validated uppercase values."""
    if values is None:
        return None
    parsed = [v.strip().upper() for v in values.split(",") if v.strip()]
    invalid = [v for v in parsed if v not in allowed]
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid filter value(s): {', '.join(invalid)}. Allowed: {', '.join(allowed)}",
        )
    return parsed or None


def _filter_conditions(
    *,
    risk_levels: Optional[List[str]],
    decisions: Optional[List[str]],
    payment_method: Optional[str],
    country: Optional[str],
    customer_id: Optional[str],
    date_from: Optional[datetime],
    date_to: Optional[datetime],
    min_fraud_probability: Optional[float],
    max_fraud_probability: Optional[float],
) -> list:
    conditions = []
    if risk_levels:
        conditions.append(Transaction.risk_level.in_(risk_levels))
    if decisions:
        conditions.append(Transaction.decision.in_(decisions))
    if payment_method:
        conditions.append(func.lower(Transaction.payment_method) == payment_method.lower())
    if country:
        conditions.append(func.upper(Transaction.country) == country.upper())
    if customer_id:
        conditions.append(Transaction.customer_id == customer_id)
    # Date range applies to created_at — the canonical, always-present record timeline.
    if date_from is not None:
        conditions.append(Transaction.created_at >= date_from)
    if date_to is not None:
        conditions.append(Transaction.created_at <= date_to)
    if min_fraud_probability is not None:
        conditions.append(Transaction.fraud_probability >= min_fraud_probability)
    if max_fraud_probability is not None:
        conditions.append(Transaction.fraud_probability <= max_fraud_probability)
    return conditions


async def _compute_summary(
    db: AsyncSession,
    conditions: list,
    threshold: float,
) -> TransactionSummary:
    """
    Aggregate KPIs over the ENTIRE filtered result set in one SQL query.

    - predicted_fraud_count: probability >= locked threshold (model output,
      NOT confirmed fraud).
    - estimated_expected_loss: documented modeled estimate
        Σ_flagged (1 − p) × FP_COST  +  Σ_allowed p × amount
      where flagged = decision != 'ALLOW' (i.e. p >= threshold). This mirrors
      the Phase 2 business cost assumptions (ml/threshold.py): review cost for
      false alarms, transaction amount as loss for undetected fraud.
    """
    fp_cost = settings.EXPECTED_LOSS_FP_COST

    scored = and_(
        Transaction.fraud_probability.isnot(None),
        Transaction.decision.isnot(None),
    )
    expected_cost = case(
        (
            scored & (Transaction.decision != "ALLOW"),
            (1.0 - Transaction.fraud_probability) * fp_cost,
        ),
        else_=Transaction.fraud_probability * func.coalesce(Transaction.amount, 0.0),
    )

    aggregate_columns = [
        func.count(Transaction.id).label("total"),
        func.coalesce(
            func.sum(case((Transaction.fraud_probability >= threshold, 1), else_=0)),
            0,
        ).label("predicted_fraud"),
        func.coalesce(
            func.sum(case((Transaction.risk_level.in_(["HIGH", "CRITICAL"]), 1), else_=0)),
            0,
        ).label("high_critical"),
        func.coalesce(
            func.sum(case((Transaction.decision == "REVIEW", 1), else_=0)),
            0,
        ).label("review_queue"),
        func.sum(expected_cost).label("estimated_expected_loss"),
        *[
            func.coalesce(
                func.sum(case((Transaction.risk_level == level, 1), else_=0)), 0
            ).label(f"risk_{level.lower()}")
            for level in RISK_LEVELS
        ],
    ]
    agg_stmt = select(*aggregate_columns)
    if conditions:
        agg_stmt = agg_stmt.where(and_(*conditions))
    agg = await db.execute(agg_stmt)
    row = agg.one()

    total = int(row.total or 0)
    predicted_fraud = int(row.predicted_fraud or 0)
    estimated_loss = row.estimated_expected_loss
    return TransactionSummary(
        total_transactions=total,
        predicted_fraud_count=predicted_fraud,
        high_critical_count=int(row.high_critical or 0),
        review_queue_count=int(row.review_queue or 0),
        predicted_fraud_rate=round(predicted_fraud / total, 4) if total else 0.0,
        risk_level_counts={
            level: int(getattr(row, f"risk_{level.lower()}") or 0)
            for level in RISK_LEVELS
        },
        estimated_expected_loss=(
            round(float(estimated_loss), 2) if estimated_loss is not None and total else None
        ),
    )


@router.get(
    "/transactions",
    response_model=TransactionListResponse,
    dependencies=[Depends(require_viewer)],
)
async def list_transactions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1, description="1-based page number"),
    page_size: int = Query(25, ge=1, le=100, description="Rows per page"),
    risk_level: Optional[str] = Query(None, description="Comma-separated: LOW,MEDIUM,HIGH,CRITICAL"),
    decision: Optional[str] = Query(None, description="Comma-separated: ALLOW,MONITOR,REVIEW"),
    payment_method: Optional[str] = Query(None, description="Exact match, e.g. card"),
    country: Optional[str] = Query(None, description="Two-letter country code"),
    customer_id: Optional[str] = Query(None, description="Exact customer ID (customer history view)"),
    date_from: Optional[datetime] = Query(None, description="ISO 8601 lower bound on created_at"),
    date_to: Optional[datetime] = Query(None, description="ISO 8601 upper bound on created_at"),
    min_fraud_probability: Optional[float] = Query(None, ge=0.0, le=1.0),
    max_fraud_probability: Optional[float] = Query(None, ge=0.0, le=1.0),
    sort_by: str = Query("created_at", description=f"One of: {', '.join(SORTABLE_COLUMNS)}"),
    sort_order: str = Query("desc", description="asc | desc"),
):
    """Paginated transaction explorer feed with server-side summary aggregates."""
    sort_column = SORTABLE_COLUMNS.get(sort_by)
    if sort_column is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid sort_by '{sort_by}'. Allowed: {', '.join(SORTABLE_COLUMNS)}",
        )
    order_desc = sort_order.lower() != "asc"

    risk_levels = _csv_filter(risk_level, RISK_LEVELS)
    decisions = _csv_filter(decision, ("ALLOW", "MONITOR", "REVIEW"))
    if date_from and date_to and date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="date_from must be before or equal to date_to.",
        )
    if (
        min_fraud_probability is not None
        and max_fraud_probability is not None
        and min_fraud_probability > max_fraud_probability
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="min_fraud_probability must be <= max_fraud_probability.",
        )

    conditions = _filter_conditions(
        risk_levels=risk_levels,
        decisions=decisions,
        payment_method=payment_method,
        country=country,
        customer_id=customer_id,
        date_from=date_from,
        date_to=date_to,
        min_fraud_probability=min_fraud_probability,
        max_fraud_probability=max_fraud_probability,
    )

    # Summary over the FULL filtered set — independent of pagination.
    summary = await _compute_summary(db, conditions, _selected_threshold())

    total_items = summary.total_transactions
    total_pages = math.ceil(total_items / page_size) if total_items else 1
    if page > total_pages and total_items > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"page {page} exceeds total_pages {total_pages}.",
        )

    list_stmt = select(Transaction)
    if conditions:
        list_stmt = list_stmt.where(and_(*conditions))
    ordered_stmt = list_stmt.order_by(
        sort_column.desc() if order_desc else sort_column.asc(),
        Transaction.id.asc(),
    )
    rows = (
        await db.execute(ordered_stmt.offset((page - 1) * page_size).limit(page_size))
    ).scalars().all()

    return TransactionListResponse(
        items=[TransactionRead.model_validate(row) for row in rows],
        pagination=PaginationMeta(
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=total_pages,
        ),
        summary=summary,
    )


@router.get(
    "/transactions/{transaction_id}",
    response_model=TransactionDetailResponse,
    dependencies=[Depends(require_viewer)],
)
async def get_transaction_detail(
    transaction_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Full investigation detail for one scored transaction (404 if unknown)."""
    result = await db.execute(
        select(Transaction).where(Transaction.transaction_id == transaction_id)
    )
    txn = result.scalar_one_or_none()
    if txn is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction '{transaction_id}' was not found.",
        )
    return TransactionDetailResponse.model_validate(txn)



@router.post(
    "/transactions/score",
    response_model=TransactionScoreResponse,
    dependencies=[Depends(require_analyst)],
)
async def score_transaction(
    payload: TransactionScoreRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Score one transaction for fraud risk (defensive review only)."""
    service = get_default_service()

    try:
        prediction = service.predict(payload.model_dump())
    except MLServiceUnavailable as exc:
        logger.error("Scoring rejected; ML unavailable: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Fraud detection model is unavailable. Try again later.",
        )
    except PredictionError as exc:
        logger.exception("Prediction failure for transaction %s", payload.transaction_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to score the transaction.",
        )

    # Persist transaction + scoring result (one atomic commit below).
    try:
        existing = await db.execute(
            select(Transaction).where(Transaction.transaction_id == payload.transaction_id)
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Transaction '{payload.transaction_id}' has already been scored.",
            )

        transaction = Transaction(
            transaction_id=payload.transaction_id,
            customer_id=payload.customer_id,
            merchant_id=payload.merchant_id,
            amount=payload.amount,
            currency=payload.currency,
            status="scored",
            device_id=payload.device_id,
            payment_method=payload.payment_method,
            country=payload.country,
            fraud_probability=prediction.fraud_probability,
            risk_level=prediction.risk_level,
            decision=prediction.decision,
            model_version=prediction.model_version,
            scored_at=prediction.scored_at,
            risk_signals=list(prediction.risk_signals),
        )
        db.add(transaction)

        await record_audit_event(
            db,
            event="TRANSACTION_SCORED",
            actor=current_user.username,
            transaction_id=prediction.transaction_id,
            metadata_={
                "model_version": prediction.model_version,
                "risk_level": prediction.risk_level,
                "decision": prediction.decision,
                "fraud_probability": prediction.fraud_probability,
                "threshold": prediction.threshold,
            },
        )

        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception:
        logger.exception("Database failure while persisting score for %s", payload.transaction_id)
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to store the scoring result.",
        )

    return TransactionScoreResponse(
        transaction_id=prediction.transaction_id,
        fraud_probability=prediction.fraud_probability,
        risk_level=prediction.risk_level,
        threshold=prediction.threshold,
        decision=prediction.decision,
        risk_signals=prediction.risk_signals,
        model_version=prediction.model_version,
        scored_at=prediction.scored_at,
    )
