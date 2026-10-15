"""The defaults every tenant gets, copied in when the tenant is created.

A tenant is not usable until it has these rows. Without roles a user cannot be
assigned one; without prefixes `DocumentSequenceService` cannot build an order
number; without templates the OTP flows have no body; and without a first admin
nobody can sign in to create the rest.

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
from src.api.extensions import bcrypt
from src.api.models.role_model import Role
from src.api.models.user_model import User
from src.api.tenancy.context import tenant_scope
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


def provision_tenant(tenant_id: int, timezone_name: str | None, currency: str | None, admin: dict):
    """Make a freshly created tenant usable: baseline defaults + its first admin.

    This is what platform tenant creation calls, immediately after committing
    the `tenants` row. `tenant_id` decides every row's `tenant_id` (via the
    `tenant_scope` below), the zone decides how its dates are read, and the
    currency is copied into its settings.

    Kept here rather than in the management service for the same reason
    `bootstrap_tenant` is: a service should not have to know the copy-on-create
    definition, and that definition must not exist in two places.

    Raises on any failure. The caller compensates (by archiving the tenant) --
    see src/api/services/tenant_management_service.py.
    """
    with tenant_scope(tenant_id, timezone_name):
        seed_tenant_baseline(currency or "INR")
        _create_initial_admin(tenant_id, admin)


def _create_initial_admin(tenant_id: int, admin: dict) -> None:
    """Create the tenant's first administrator, in this tenant's scope.

    The role is resolved by CODE rather than id: ids differ per tenant, and a
    literal `1` would mean Super Admin on one deployment and Dashboard on
    another. `seed_roles` has just run inside `provision_tenant`, so ADMIN
    exists; if it does not, that is a seeding failure and raising here is what
    lets `provision_tenant` roll the whole tenant back instead of leaving a
    cafe nobody can sign into.

    The password is hashed at rest and never echoed back. This account is
    `is_email_verified=True` because it is created by the platform operator
    from known details -- self-registration starts unverified because nobody
    vouches for that address yet.
    """
    role = (
        db_session.query(Role)
        .filter_by(role_code="ADMIN", is_deleted=False)
        .first()
    )
    if role is None:
        raise RuntimeError(
            "The ADMIN role was not seeded for the new tenant; cannot create "
            "its first administrator."
        )

    hashed = bcrypt.generate_password_hash(admin["password"], 12).decode("utf-8")
    db_session.add(User(
        first_name=admin["first_name"],
        last_name=admin["last_name"],
        email=admin["email"],
        password=hashed,
        role_id=role.id,
        is_email_verified=True,
        is_active=True,
        ## Explicit: this runs after several seeders have called
        ## db_session.remove(), so relying on the context still being bound
        ## would be a guess. The scope above guarantees it either way.
        tenant_id=tenant_id,
    ))
    db_session.commit()
    print(f"  Created first admin: {admin['email']} ({role.role_name})")


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
