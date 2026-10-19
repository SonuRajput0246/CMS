"""The defaults every tenant gets, copied in when the tenant is created.

A tenant is not usable until it has these rows. Without roles a user cannot be
assigned one; without prefixes `DocumentSequenceService` cannot build an order
number; without templates the OTP flows have no body; and without an invitation
nobody can sign in to create the rest -- the first administrator's account is
born when they accept it (src/api/services/tenant_invitation_service.py).

This is the "copy-on-create" half of the tenancy design. It is deliberately
separate from the demo domain data (inventory, floor plan, customers, orders)
so tenant provisioning can call it without also seeding a fictitious cafe's
sales history.

The tenant must already be in scope: every seeder below writes rows that carry
a `tenant_id`, which is stamped from the tenancy context at flush time. Call
`bootstrap_tenant()` for the scope, or run inside `tenant_scope()` yourself.

Prerequisite, and the reason `run_base_seeders` seeds globals first: `seed_roles`
resolves permissions against the live `modules` table, which is global. With an
empty module tree every role is created with no permissions and nothing fails.
"""
from src.api.models.role_model import Role
from src.api.models.tenant_model import Tenant
from src.api.tenancy.context import tenant_scope
from src.api.services.tenant_invitation_service import create_invitation
from src.database.seeders.prefixes_seeder import seed_prefixes
from src.database.seeders.role_seeder import seed_roles
from src.database.seeders.super_admin_seeder import seed_super_admin
from src.database.seeders.system_setting_seeder import seed_system_settings
from src.database.seeders.template_seeder import seed_templates
from src.database.session import db_session


def seed_tenant_baseline(default_currency: str = "INR"):
    """Settings, prefixes, templates and roles -- but no user account.

    Split out from `seed_tenant_defaults` because the two callers need the
    first half and disagree about the admin:

      * the demo seeders still want the hardcoded `seed_super_admin`, so
        `seed_tenant_defaults` adds it and behaves exactly as before;
      * a tenant created from the platform console supplies its own
        administrator (`provision_tenant` below), and must NOT get the seeder's
        known-credentials account bolted onto it as well.

    Order still matters: roles resolve permissions against the global module
    tree, so the module seed must already have run (see run_base_seeders).
    """
    seed_system_settings(default_currency)
    seed_prefixes()
    seed_templates()
    ## Needs the global module tree to already exist. See the module docstring.
    seed_roles()


def seed_tenant_defaults(default_currency: str = "INR"):
    """Seed the defaults for the tenant that is current in this scope.

    Order matters within the set: roles before the admin that references one.
    `default_currency` is the tenant's currency, written into its settings so
    the two do not disagree.
    """
    seed_tenant_baseline(default_currency)
    seed_super_admin()


def provision_tenant(tenant_id: int, timezone_name: str | None, currency: str | None, admin: dict) -> dict:
    """Make a freshly created tenant provisionable: baseline defaults + its
    first administrator's invitation.

    This is what platform tenant creation calls, immediately after committing
    the `tenants` row. `tenant_id` decides every row's `tenant_id` (via the
    `tenant_scope` below), the zone decides how its dates are read, and the
    currency is copied into its settings.

    `admin` is name + email ONLY -- there is no password to seed, because the
    administrator chooses it on the accept page. What comes back is the
    issued invitation's plain values, including the one-time raw token:

        {"invitation_id", "token", "expires_at", "email"}

    The caller emails the link and then forgets the token; only its SHA-256
    hash is in the database. Returning it is the sole reason the raw token
    exists outside the emailed URL at all.

    Kept here rather than in the management service for the same reason
    `bootstrap_tenant` is: a service should not have to know the copy-on-create
    definition, and that definition must not exist in two places.

    Raises on any failure -- including the invitation insert. The caller
    compensates (by archiving the tenant) -- see
    src/api/services/tenant_management_service.py -- because a tenant whose
    invitation could not be issued is exactly as unreachable as one with no
    roles: nobody can sign in to it.
    """
    with tenant_scope(tenant_id, timezone_name):
        seed_tenant_baseline(currency or "INR")

        tenant = (
            db_session.query(Tenant)
            .filter(Tenant.id == tenant_id, Tenant.is_deleted == False)
            .first()
        )
        if tenant is None:
            ## The caller committed this row moments ago; if it is not (or is
            ## already soft-deleted), provisioning is running against
            ## something other than a live tenant and must not seed into it.
            raise RuntimeError(
                f"Tenant {tenant_id} not found (or archived) during provisioning."
            )

        ## Roles must exist before the invitation can ever be accepted: the
        ## accept path resolves the ADMIN role by code and refuses without it.
        ## Checking HERE is what makes a missing role fail the whole create
        ## (and get compensated by archiving) rather than surfacing later as
        ## an account nobody can finish.
        role = (
            db_session.query(Role)
            .filter_by(role_code="ADMIN", is_deleted=False)
            .first()
        )
        if role is None:
            raise RuntimeError(
                "The ADMIN role was not seeded for the new tenant; cannot "
                "issue its first administrator's invitation."
            )

        issued = create_invitation(
            db_session,
            tenant,
            {
                "first_name": admin["first_name"],
                "last_name": admin["last_name"],
                "email": admin["email"],
            },
            ## No acting user here: the platform operator's identity is
            ## recorded by the CREATE_TENANT audit entry, and this value
            ## belongs to whoever triggered the provisioning call.
            invited_by=None,
        )
        print(
            f"  Issued admin invitation: {issued['email']} "
            f"(expires {issued['expires_at']})"
        )
        return issued


def bootstrap_tenant(tenant):
    """Provision a freshly created tenant: enter its scope, then seed defaults.

    This is what tenant creation should call. `tenant` is an ORM `Tenant` (or
    anything with `id`, `timezone` and `currency`); the id decides the rows'
    `tenant_id`, the zone decides how the tenant's dates are interpreted, and
    the currency is copied into its settings.

    Kept here, beside the seeders that define the template, rather than in a
    service: a service should not have to import a seeder module to provision a
    tenant, and the copy-on-create definition should not live in two places.
    """
    with tenant_scope(tenant.id, getattr(tenant, "timezone", None)):
        seed_tenant_defaults(getattr(tenant, "currency", None) or "INR")
