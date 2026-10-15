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
from src.api.tenancy.context import tenant_scope
from src.database.seeders.prefixes_seeder import seed_prefixes
from src.database.seeders.role_seeder import seed_roles
from src.database.seeders.super_admin_seeder import seed_super_admin
from src.database.seeders.system_setting_seeder import seed_system_settings
from src.database.seeders.template_seeder import seed_templates


def seed_tenant_defaults(default_currency: str = "INR"):
    """Seed the defaults for the tenant that is current in this scope.

    Order matters within the set: roles before the admin that references one.
    `default_currency` is the tenant's currency, written into its settings so
    the two do not disagree.
    """
    seed_system_settings(default_currency)
    seed_prefixes()
    seed_templates()
    ## Needs the global module tree to already exist. See the module docstring.
    seed_roles()
    seed_super_admin()


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
