"""tentativas por ip

Revision ID: 1261db446ea4
Revises: 55da2fa5e05c
Create Date: 2026-09-17 18:02:41.274268
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '1261db446ea4'
down_revision: str | None = '55da2fa5e05c'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'tentativas_ip',
        sa.Column('ip', postgresql.INET(), nullable=False),
        sa.Column('tentativas', sa.Integer(), server_default='0', nullable=False),
        sa.Column(
            'janela_inicio',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint('ip', name=op.f('pk_tentativas_ip')),
    )


def downgrade() -> None:
    op.drop_table('tentativas_ip')
