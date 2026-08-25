"""Transaction fraud-scoring API.

POST /api/transactions/score — score a transaction with the verified Random
Forest detector, persist the result and write an audit event.

RBAC: ADMIN and ANALYST may score. VIEWER is read-only (no scoring mutation).
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import require_analyst, get_current_user
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.transaction import (
    TransactionScoreRequest,
    TransactionScoreResponse,
)
from app.services.audit_service import record_audit_event
from app.services.ml_service import (
    MLServiceUnavailable,
    PredictionError,
    get_default_service,
)

logger = logging.getLogger(__name__)

router = APIRouter()


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
