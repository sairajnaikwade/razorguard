"""create ai_reports table

Revision ID: d5e3c7a8b9f1
Revises: b7d2f8a41c93
Create Date: 2026-08-26 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd5e3c7a8b9f1'
down_revision: Union[str, None] = 'b7d2f8a41c93'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# JSONB on PostgreSQL, plain JSON elsewhere (e.g. SQLite test database).
JSONField = postgresql.JSONB().with_variant(sa.JSON(), "sqlite")


def upgrade() -> None:
    op.create_table(
        'ai_reports',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('transaction_id', sa.String(length=100), nullable=False),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('key_evidence', JSONField, nullable=False),
        sa.Column('risk_reasoning', sa.Text(), nullable=False),
        sa.Column('recommended_action', sa.String(length=100), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=False),
        sa.Column('limitations', JSONField, nullable=False),
        sa.Column('is_mock', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_ai_reports_transaction_id'), 'ai_reports', ['transaction_id'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_ai_reports_transaction_id'), table_name='ai_reports')
    op.drop_table('ai_reports')
