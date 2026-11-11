"""kds ticket hold

Adds `cms_orders.kds_held_at`: when the pass parks a ticket (guest not ready,
course not fired) the timestamp is set and the board stops treating it as
overdue. It is cleared when the ticket is resumed, or when any line on it is
advanced -- cooking the dish means the hold no longer applies.

Nullable and additive, so existing orders are unaffected.

Revision ID: c1a2b3d4e5f6
Revises: a3f7c9d1e2b4
Create Date: 2026-11-11 18:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1a2b3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'a3f7c9d1e2b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'cms_orders',
        sa.Column('kds_held_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('cms_orders', 'kds_held_at')
