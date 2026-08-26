"""add risk_signals column to transactions

Adds a nullable risk_signals JSON/JSONB column to the transactions table
(Phase 4). Purely additive — no data is modified or deleted. Rows scored
before this migration keep NULL for risk_signals.

Revision ID: b7d2f8a41c93
Revises: c41d7a2b9e05
Create Date: 2026-08-25
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b7d2f8a41c93'
down_revision: Union[str, None] = 'c41d7a2b9e05'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# JSONB on PostgreSQL, plain JSON on other dialects.
RiskSignalsJSON = postgresql.JSONB().with_variant(sa.JSON(), "sqlite")


def upgrade() -> None:
    op.add_column('transactions', sa.Column('risk_signals', RiskSignalsJSON, nullable=True))


def downgrade() -> None:
    op.drop_column('transactions', 'risk_signals')
