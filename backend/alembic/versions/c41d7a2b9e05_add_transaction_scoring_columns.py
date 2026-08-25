"""add transaction scoring columns

Adds ML scoring result columns to the transactions table (Phase 3).
Purely additive; existing rows keep NULL for the new fields.

Revision ID: c41d7a2b9e05
Revises: 4eb56d49175f
Create Date: 2026-08-25
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c41d7a2b9e05'
down_revision: Union[str, None] = '4eb56d49175f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('transactions', sa.Column('device_id', sa.String(length=100), nullable=True))
    op.add_column('transactions', sa.Column('payment_method', sa.String(length=50), nullable=True))
    op.add_column('transactions', sa.Column('country', sa.String(length=10), nullable=True))
    op.add_column('transactions', sa.Column('fraud_probability', sa.Float(), nullable=True))
    op.add_column('transactions', sa.Column('risk_level', sa.String(length=20), nullable=True))
    op.add_column('transactions', sa.Column('decision', sa.String(length=20), nullable=True))
    op.add_column('transactions', sa.Column('model_version', sa.String(length=100), nullable=True))
    op.add_column('transactions', sa.Column('scored_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('transactions', 'scored_at')
    op.drop_column('transactions', 'model_version')
    op.drop_column('transactions', 'decision')
    op.drop_column('transactions', 'risk_level')
    op.drop_column('transactions', 'fraud_probability')
    op.drop_column('transactions', 'country')
    op.drop_column('transactions', 'payment_method')
    op.drop_column('transactions', 'device_id')
