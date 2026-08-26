"""AI investigation service utilizing Gemini via the official Google GenAI SDK (Phase 5)."""

import logging
import os
import json
from typing import List

from google import genai
from google.genai import types
from pydantic import ValidationError

from app.core.config import settings
from app.models.transaction import Transaction
from app.models.audit import AuditLog
from app.schemas.ai import AIInvestigationResponse

logger = logging.getLogger(__name__)


def generate_mock_investigation(
    transaction: Transaction,
    history: List[Transaction],
    audit_logs: List[AuditLog]
) -> AIInvestigationResponse:
    """Generate a deterministic mock investigation report when API key is missing."""
    logger.info("Generating mock investigation for transaction %s", transaction.transaction_id)

    # Base characteristics
    risk_level = transaction.risk_level or "LOW"
    amount = float(transaction.amount)
    currency = transaction.currency
    country = transaction.country or "unknown country"
    payment_method = transaction.payment_method or "unknown method"

    # Derive evidence list from risk signals
    evidence = [
        f"Scored transaction amount: {amount} {currency}.",
        f"Payment method: {payment_method}.",
        f"Transaction country: {country}."
    ]
    if transaction.risk_signals:
        for signal in transaction.risk_signals:
            evidence.append(f"Model Flag: {signal}.")

    # Historical stats
    hist_count = len(history)
    if hist_count > 0:
        evidence.append(f"Customer has {hist_count} previous transaction(s) in local history.")
    else:
        evidence.append("No historical transactions found for this customer.")

    # Recommended action & confidence based on risk level
    if risk_level == "CRITICAL":
        recommended_action = "ESCALATE"
        confidence = 0.95
        reasoning = (
            "[OFFLINE MOCK] The transaction was classified as CRITICAL risk due to extreme anomalies. "
            "Model parameters indicate severe risk indicators (e.g. extremely high probability or critical flags). "
            "Escalation to administrative review is highly recommended."
        )
    elif risk_level == "HIGH":
        recommended_action = "REQUEST_VERIFICATION"
        confidence = 0.85
        reasoning = (
            "[OFFLINE MOCK] High risk indicators were detected. The transaction matches patterns "
            "consistent with suspicious activity. Requesting user verification (2FA, KYC) is recommended before allowing."
        )
    elif risk_level == "MEDIUM":
        recommended_action = "MONITOR"
        confidence = 0.65
        reasoning = (
            "[OFFLINE MOCK] Medium risk detected. The transaction has minor deviations from standard customer behavior, "
            "but doesn't exceed critical risk thresholds. Recommended action is to allow but monitor."
        )
    else:
        recommended_action = "ALLOW"
        confidence = 0.95
        reasoning = (
            "[OFFLINE MOCK] Low risk profile. The transaction parameters appear normal, "
            "and no significant risk signals were triggered. Standard processing is recommended."
        )

    # Limitations
    limitations = ["[OFFLINE MOCK] System is running in offline mock mode."]
    if hist_count == 0:
        limitations.append("Analysis is limited by the absence of customer transaction history.")
    if not audit_logs:
        limitations.append("Audit timeline is empty or unavailable.")

    return AIInvestigationResponse(
        summary=f"[OFFLINE MOCK] Mock investigation report for transaction {transaction.transaction_id}.",
        key_evidence=evidence,
        risk_reasoning=reasoning,
        recommended_action=recommended_action,
        confidence=confidence,
        limitations=limitations,
        is_mock=True
    )


def build_agent_prompt(
    transaction: Transaction,
    history: List[Transaction],
    audit_logs: List[AuditLog]
) -> str:
    """Build a detailed grounding prompt with strictly formatted context data."""
    # Build history context
    history_ctx = []
    for h in history[:10]:  # limit to 10 most recent for prompt size
        history_ctx.append({
            "transaction_id": h.transaction_id,
            "amount": float(h.amount),
            "currency": h.currency,
            "risk_level": h.risk_level,
            "decision": h.decision,
            "country": h.country,
            "payment_method": h.payment_method,
            "timestamp": h.scored_at.isoformat() if h.scored_at else h.created_at.isoformat()
        })

    # Build audit context
    audit_ctx = []
    for a in audit_logs[:10]:
        audit_ctx.append({
            "event": a.event,
            "actor": a.actor,
            "timestamp": a.timestamp.isoformat() if a.timestamp else None,
            "details": a.details
        })

    context = {
        "target_transaction": {
            "transaction_id": transaction.transaction_id,
            "customer_id": transaction.customer_id,
            "merchant_id": transaction.merchant_id,
            "amount": float(transaction.amount),
            "currency": transaction.currency,
            "payment_method": transaction.payment_method,
            "device_id": transaction.device_id,
            "country": transaction.country,
            "model_outputs": {
                "fraud_probability": transaction.fraud_probability,
                "risk_level": transaction.risk_level,
                "decision": transaction.decision,
                "model_version": transaction.model_version
            },
            "risk_signals": transaction.risk_signals or []
        },
        "customer_recent_history": history_ctx,
        "audit_trail": audit_ctx
    }

    return f"""You are the RazorGuard AI Investigation Agent, an expert copilot for payment fraud analysts.
Analyze the target transaction, risk signals, recent customer history, and audit log trail to synthesize a structured investigation report.

SAFETY & GROUNDING CONSTRAINTS:
1. You must NEVER override the Random Forest model's risk score, risk level, or decision. Explain them, do not replace them.
2. Rely ONLY on the provided context facts. Do NOT fabricate or assume any external information (such as names, addresses, or IP ranges not explicitly given).
3. Do NOT leak or discuss any system secrets, API keys, passwords, or tokens.
4. Output must strictly conform to the requested JSON structure.

INPUT CONTEXT:
{json.dumps(context, indent=2)}

Please provide your findings in valid JSON matching the schema for AIInvestigationResponse."""


class AIServiceError(Exception):
    """Exception raised for errors in the AI service."""


def run_ai_investigation(
    transaction: Transaction,
    history: List[Transaction],
    audit_logs: List[AuditLog]
) -> AIInvestigationResponse:
    """
    Generate an AI-driven fraud investigation report.
    If GEMINI_API_KEY is not configured in settings, falls back to mock/offline generation.
    """
    api_key = settings.GEMINI_API_KEY or os.getenv("GEMINI_API_KEY")
    if not api_key:
        return generate_mock_investigation(transaction, history, audit_logs)

    model = settings.GEMINI_MODEL or os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    logger.info("Calling Gemini API using model: %s", model)

    try:
        client = genai.Client(api_key=api_key)
        prompt = build_agent_prompt(transaction, history, audit_logs)

        # Structure response strictly to match the Pydantic schema
        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=AIInvestigationResponse,
                temperature=0.1
            )
        )

        if not response.text:
            raise AIServiceError("Empty response returned from Gemini API")

        # Parse and validate the response against the schema
        data = json.loads(response.text)
        # Ensure is_mock is set to False since this is from the live API
        data["is_mock"] = False
        return AIInvestigationResponse.model_validate(data)

    except ValidationError as e:
        logger.error("Gemini API output failed schema validation: %s", e)
        raise AIServiceError(f"AI response failed schema validation: {e}") from e
    except json.JSONDecodeError as e:
        logger.error("Gemini API returned invalid JSON: %s", e)
        raise AIServiceError(f"AI response was not valid JSON: {e}") from e
    except Exception as e:
        logger.exception("Unexpected error during Gemini investigation generation")
        raise AIServiceError(f"Gemini API invocation failed: {e}") from e
