"""AI investigation agent schemas (Phase 5)."""

from typing import List
from pydantic import BaseModel, ConfigDict, Field


class AIInvestigationResponse(BaseModel):
    """Structured analysis report returned by the AI Investigation Agent."""

    model_config = ConfigDict(from_attributes=True)

    summary: str = Field(
        ...,
        description="A concise summary of the transaction's overall context and potential risk profile."
    )
    key_evidence: List[str] = Field(
        ...,
        description="List of specific, verifiable evidence items extracted from transaction data, history, and risk signals."
    )
    risk_reasoning: str = Field(
        ...,
        description="Logical reasoning explaining the potential fraud risk based on current signals and historical context."
    )
    recommended_action: str = Field(
        ...,
        description="Suggested action for the analyst (e.g. ALLOW, MONITOR, REQUEST_VERIFICATION, ESCALATE)."
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="AI confidence score between 0.0 (completely uncertain) and 1.0 (highly certain)."
    )
    limitations: List[str] = Field(
        ...,
        description="Disclosure of missing evidence, data gaps, or analytical constraints."
    )
    is_mock: bool = Field(
        False,
        description="Flag indicating if the report was generated in offline/mock mode."
    )
