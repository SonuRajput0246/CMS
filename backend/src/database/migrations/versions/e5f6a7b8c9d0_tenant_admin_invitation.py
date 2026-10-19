"""tenant admin invitation

Adds `tenant_admin_invitations`: the single-use, hash-only record behind the
link a new tenant's first administrator clicks to choose their password
(see src/api/services/tenant_invitation_service.py).

Also backfills the TENANT_ADMIN_INVITATION row into `message_templates` for
tenants that already exist. The seeder only runs during provisioning, so
without this a pre-existing tenant would have no editable template and every
resend would log an error and use built-in fallback copy.

Revision ID: e5f6a7b8c9d0
Revises: b7c1d2e3f4a5
Create Date: 2026-10-19 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'b7c1d2e3f4a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


## Body copy kept in step with `_invitation_message()` in
## src/database/seeders/template_seeder.py -- a fresh install seeds the
## seeder's string and this backfills the identical one. Frozen artifact:
## edit the seeder, not this, for future copy changes; the two only need to
## agree closely enough that an admin editing the row later is editing real
## content.
INVITATION_BODY = (
    '<h2 style="color:#333;">Set up the administrator account for {{ hotel_name }}</h2>'
    "<p>Hello {{ user_name }},</p>"
    "<p>A workspace for <b>{{ hotel_name }}</b> has been created and you "
    "have been invited to be its administrator. Choose your password to "
    "activate the account:</p>"
    '<p style="text-align: center;">'
    '<a href="{{ invite_url }}" '
    'style="display:inline-block; padding:12px 24px; background-color:#2c3e50; '
    'color:#ffffff; text-decoration:none; border-radius:4px;">'
    "Accept invitation</a></p>"
    "<p>If the button does not work, copy this link into your browser:</p>"
    '<p style="word-break:break-all; color:#555;">{{ invite_url }}</p>'
    "<p>This invitation is valid for <b>{{ expiry_hours }} hours</b>.</p>"
    "<p>If you were not expecting this email, you can safely ignore it.</p>"
    "<br>"
    "<p>Regards,<br><b>CMS</b></p>"
)

INVITATION_BACKFILL_SQL = """
INSERT INTO message_templates
    (tenant_id, code, channel, name, description,
     subject_template, title_template, message_template,
     variables, sample_context,
     is_active, is_system, version, sort_order,
     created_by, updated_by, is_deleted, deleted_at,
     created_at, updated_at)
SELECT
    t.id,
    'TENANT_ADMIN_INVITATION',
    'email',
    'Tenant Administrator Invitation',
    'Sent to the first administrator when the platform creates a new tenant. Contains the single-use link that sets their password.',
    'Set up your administrator account',
    NULL,
    :body,
    CAST('["user_name", "hotel_name", "invite_url", "expiry_hours"]' AS JSON),
    CAST('{"user_name": "Jane Doe", "hotel_name": "Sunrise Cafe", "invite_url": "http://sunrise.localhost:4200/auth/accept-invitation?token=example-token", "expiry_hours": 72}' AS JSON),
    1, 1, 1, 30,
    NULL, NULL, 0, NULL,
    NOW(), NOW()
FROM tenants t
WHERE t.is_deleted = 0
  AND NOT EXISTS (
      SELECT 1 FROM message_templates m
      WHERE m.tenant_id = t.id
        AND m.code = 'TENANT_ADMIN_INVITATION'
        AND m.channel = 'email'
        AND m.is_deleted = 0
  )
"""


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'tenant_admin_invitations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('first_name', sa.String(length=50), nullable=False),
        sa.Column('last_name', sa.String(length=50), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        ## SHA-256 of the raw token; the raw value is never stored.
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('invited_by', sa.String(length=255), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ux_invitation_token_hash', 'tenant_admin_invitations',
        ['token_hash'], unique=True,
    )
    op.create_index(
        'ix_invitation_tenant_status', 'tenant_admin_invitations',
        ['tenant_id', 'is_deleted', 'id'], unique=False,
    )
    op.create_index(
        'ix_invitation_tenant_email', 'tenant_admin_invitations',
        ['tenant_id', 'email'], unique=False,
    )

    ## MySQL-only by design: this deployment targets MySQL (mysqlclient),
    ## and a data backfill is not the place to abstract over one dialect.
    ## Bound as a parameter rather than interpolated: the body is long,
    ## contains braces for the {{ }} placeholders, and a parameter keeps
    ## it out of SQL parsing entirely.
    op.execute(
        sa.text(INVITATION_BACKFILL_SQL).bindparams(body=INVITATION_BODY)
    )


def downgrade() -> None:
    """Downgrade schema."""
    ## Removes the backfilled (or since admin-edited) system rows: the
    ## feature they belong to is going away, and leaving them would leave
    ## the admin editing templates nothing resolves.
    op.execute(
        sa.text(
            "DELETE FROM message_templates "
            "WHERE code = 'TENANT_ADMIN_INVITATION' AND is_system = 1"
        )
    )
    op.drop_index('ix_invitation_tenant_email', table_name='tenant_admin_invitations')
    op.drop_index('ix_invitation_tenant_status', table_name='tenant_admin_invitations')
    op.drop_index('ux_invitation_token_hash', table_name='tenant_admin_invitations')
    op.drop_table('tenant_admin_invitations')
