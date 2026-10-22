"""The defaults every tenant gets, copied in when the tenant is created.

A tenant is not usable until it has these rows. Without roles a user cannot be
assigned one; without prefixes `DocumentSequenceService` cannot build an order
number; without templates the OTP flows have no body; and without a first
administrator nobody can sign in to create the rest.

That first administrator arrives one of two ways, and `provision_tenant` takes
whichever the platform operator asked for:

  * an invitation -- the account is born when they accept the emailed link
    (src/api/services/tenant_invitation_service.py), choosing their own
    password; or
  * direct creation -- the operator supplies the password and the OWNER
    account exists immediately.

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
from src.api.models.tenant_model import Tenant
from src.api.models.user_model import User
from src.api.tenancy.context import tenant_scope
from src.api.services.tenant_invitation_service import create_invitation
from src.api.utils.datetime_helper import utcnow
from src.database.seeders.prefixes_seeder import seed_prefixes
from src.database.seeders.role_seeder import seed_roles
from src.database.seeders.demo_tenant_owner_seeder import seed_demo_tenant_owner
from src.database.seeders.system_setting_seeder import seed_system_settings
from src.database.seeders.template_seeder import seed_templates
from src.database.session import db_session


def seed_tenant_baseline(default_currency: str = "INR"):
    """Settings, prefixes, templates and roles -- but no user account.

    Split out from `seed_tenant_defaults` because the two callers need the
    first half and disagree about the admin:

      * the demo seed path wants the configured `seed_demo_tenant_owner`, so
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
    seed_demo_tenant_owner()


def provision_tenant(tenant_id: int, timezone_name: str | None, currency: str | None, admin: dict) -> dict:
    """Make a freshly created tenant provisionable: baseline defaults + its
    first administrator.

    This is what platform tenant creation calls, immediately after committing
    the `tenants` row. `tenant_id` decides every row's `tenant_id` (via the
    `tenant_scope` below), the zone decides how its dates are read, and the
    currency is copied into its settings.

    `admin` is always name + email. It carries a `password` only when the
    operator chose to create the owner directly; otherwise the administrator
    chooses their own on the invitation accept page. The returned dict's
    `mode` says which path ran:

        {"mode": "owner", "email", "user_id"}
        {"mode": "invitation", "invitation_id", "token", "expires_at", "email"}

    The invitation token is the one-time raw value: the caller emails the link
    and then forgets it; only its SHA-256 hash is in the database. Returning it
    is the sole reason the raw token exists outside the emailed URL at all.

    Kept here rather than in the management service for the same reason
    `bootstrap_tenant` is: a service should not have to know the copy-on-create
    definition, and that definition must not exist in two places.

    Raises on any failure -- including the invitation insert or the owner
    insert. The caller compensates (by archiving the tenant) -- see
    src/api/services/tenant_management_service.py -- because a tenant with no
    working first administrator is exactly as unreachable as one with no roles.
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

        if admin.get("password"):
            return _create_owner(tenant, admin)

        return _issue_admin_invitation(tenant, admin)


def _create_owner(tenant: Tenant, admin: dict) -> dict:
    """Create the tenant's first account directly, with the operator's password.

    OWNER, resolved by role_code rather than id: ids differ per tenant, and a
    literal `1` would mean Owner on one deployment and Dashboard on another.
    The role was seeded moments ago by `seed_tenant_baseline`, so a miss here
    is an ordering bug -- and an account with no role has no menu and no
    permissions, so creating it anyway would only move the failure to sign-in.

    Active and email-verified from birth: there is no emailed link to click,
    and the point of this path is a workspace that is usable immediately.
    """
    role = (
        db_session.query(Role)
        .filter_by(role_code="OWNER", is_deleted=False)
        .first()
    )
    if role is None:
        raise RuntimeError(
            "The OWNER role was not seeded for the new tenant; cannot create "
            "its owner."
        )

    existing = (
        db_session.query(User)
        .filter(
            User.tenant_id == tenant.id,
            User.email == admin["email"],
            User.is_deleted == False,
        )
        .first()
    )
    if existing is not None:
        raise RuntimeError(
            f"An account for {admin['email']} already exists in this tenant."
        )

    user = User(
        first_name=admin["first_name"],
        last_name=admin["last_name"],
        email=admin["email"],
        password=bcrypt.generate_password_hash(admin["password"], 12).decode("utf-8"),
        role_id=role.id,
        is_email_verified=True,
        is_active=True,
        last_password_update_at=utcnow(),
        tenant_id=tenant.id,
    )
    db_session.add(user)
    ## Flush before commit so the caller gets a real id, not a guess, and a
    ## failed insert raises here -- inside the try that archives the tenant.
    db_session.flush()
    user_id = user.id
    db_session.commit()
    print(f"  Created owner account: {admin['email']} ({role.role_name})")
    return {"mode": "owner", "email": admin["email"], "user_id": user_id}


def _issue_admin_invitation(tenant: Tenant, admin: dict) -> dict:
    """Issue the first administrator's single-use invitation.

    Roles must exist before the invitation can ever be accepted: the accept
    path resolves the ADMIN role by code and refuses without it. Checking HERE
    is what makes a missing role fail the whole create (and get compensated by
    archiving) rather than surfacing later as an account nobody can finish.
    """
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
    return {"mode": "invitation", **issued}


def bootstrap_tenant(tenant):
    """Provision a freshly created tenant: enter its scope, then seed defaults.

    DEMO PATH ONLY, and nothing currently calls it. Platform tenant creation
    uses `provision_tenant` above, which seeds the same baseline and then
    creates the administrator the operator asked for -- directly as OWNER, or
    as an invitation. The demo seeder's known-credentials account is exactly
    what neither of those paths should add on top.

    `tenant` is an ORM `Tenant` (or anything with `id`, `timezone` and
    `currency`); the id decides the rows' `tenant_id`, the zone decides how
    the tenant's dates are interpreted, and the currency is copied into its
    settings.

    Kept here, beside the seeders that define the template, rather than in a
    service: a service should not have to import a seeder module to provision a
    tenant, and the copy-on-create definition should not live in two places.
    """
    with tenant_scope(tenant.id, getattr(tenant, "timezone", None)):
        seed_tenant_defaults(getattr(tenant, "currency", None) or "INR")
