"""super admin login lockout

Adds the brute-force guard columns to `super_admin_users`:
`failed_login_attempts` counts consecutive wrong passwords and
`locked_until` is stamped once the configured ceiling is reached.

Revision ID: b7c1d2e3f4a5
Revises: f44e81fce1b2
Create Date: 2026-10-18 12:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7c1d2e3f4a5'
down_revision: Union[str, Sequence[str], None] = 'f44e81fce1b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    ## server_default backfills existing rows, so the NOT NULL below lands
    ## without a separate data-migration step.
    op.add_column(
        'super_admin_users',
        sa.Column(
            'failed_login_attempts',
            sa.Integer(),
            server_default='0',
            nullable=False,
        ),
    )
    op.add_column(
        'super_admin_users',
        sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('super_admin_users', 'locked_until')
    op.drop_column('super_admin_users', 'failed_login_attempts')
