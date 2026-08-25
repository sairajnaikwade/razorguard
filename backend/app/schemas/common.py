from pydantic import BaseModel
from typing import Dict, Any, Optional

class ErrorResponse(BaseModel):
    detail: str

class HealthResponse(BaseModel):
    status: str
    database: str
    redis: str
    ml_model: str
