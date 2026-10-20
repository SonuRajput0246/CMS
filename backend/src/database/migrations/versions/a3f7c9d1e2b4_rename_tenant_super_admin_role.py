"""rename the tenant's SUPER_ADMIN role to OWNER

The platform's operators live in `super_admin_users` and are managed by the
console; a tenant's own top role was called "Super Admin", which read like the
same thing and was not. It holds every module of exactly one tenant and can
manage nothing else -- see role_seeder, which now seeds it as Owner / OWNER.

Renamed in place, so `roles.id` never changes and every `users.role_id` and
`role_module_access.role_id` that pointed at the role keeps pointing at it.
The seeder matches on `role_code`, so without this a re-seed would create a
second role alongside the old one instead of updating it.

Tenants that already own an OWNER row are skipped rather than forced: the
unique constraint is on (tenant_id, role_code), so the rename would be
rejected there, and `seed_roles` picks their existing row up on the next run.

Revision ID: a3f7c9d1e2b4
Revises: e5f6a7b8c9d0
Create Date: 2026-10-21 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3f7c9d1e2b4'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


## Matches the seeder's definition exactly, so a database that has only ever
## been seeded and a database that has been migrated end up describing the
## same role. Frozen artifact: edit role_seeder for future copy changes.
OWNER_DESCRIPTION = "Full access within this tenant"

## The NOT EXISTS subquery reads `roles` -- the table being updated -- which
## MySQL rejects outright, so it is wrapped in a derived table to force
## materialization. Skips (rather than collides with) a tenant that already
## owns an OWNER row, deleted ones included, because the unique constraint
## on (tenant_id, role_code) counts them too.
RENAME_UP_SQL = """
UPDATE roles
SET role_code = 'OWNER',
    role_name = 'Owner',
    description = :description
WHERE role_code = 'SUPER_ADMIN'
  AND NOT EXISTS (
      SELECT 1
      FROM (SELECT tenant_id FROM roles WHERE role_code = 'OWNER') AS owners
      WHERE owners.tenant_id = roles.tenant_id
  )
"""

RENAME_DOWN_SQL = """
UPDATE roles
SET role_code = 'SUPER_ADMIN',
    role_name = 'Super Admin',
    description = 'Full system access'
WHERE role_code = 'OWNER'
  AND NOT EXISTS (
      SELECT 1
      FROM (SELECT tenant_id FROM roles WHERE role_code = 'SUPER_ADMIN') AS supers
      WHERE supers.tenant_id = roles.tenant_id
  )
"""


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(sa.text(RENAME_UP_SQL).bindparams(description=OWNER_DESCRIPTION))


def downgrade() -> None:
    """Downgrade schema."""
    ## Restores the old label only; the role's rows, permissions and the
    ## users holding it are untouched either way.
    op.execute(sa.text(RENAME_DOWN_SQL))
