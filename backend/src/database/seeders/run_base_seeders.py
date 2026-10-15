"""Base seeding entry point.

Run with `python -m src.database.seeders.run_base_seeders` from backend/.

Ordering is load-bearing twice over:

  1. Modules seed before roles. `role_seeder` reads the live `modules` table and
     grants permissions only for modules that exist, so seeding roles first
     silently produces roles with no permissions at all.

  2. Tenants seed before anything tenant-scoped, and each tenant's rows are
     written inside `tenant_scope`. A tenant-scoped row inserted with no tenant
     in context fails loudly (`_tenant_id_default` raises) rather than landing
     unowned, which is why the demo data cannot run before the tenants exist.

Global reference data is seeded once. The tenant defaults and the demo domain
data are seeded once per tenant, because both are per-tenant by design: two
cafes have separate roles, separate floor plans and separate sales.

The platform (super admin) account is global too: it sits in `super_admin_users`
and owns no tenant, because it is what creates them.
"""
from src.api.tenancy.context import tenant_scope

from src.database.seeders.countries_states_cities_seeder import seed_countries_states_cities
from src.database.seeders.currencies_seeder import seed_currencies
from src.database.seeders.enum_seeder import seed_enums
from src.database.seeders.login_slider_seeder import seed_login_sliders
from src.database.seeders.module_seeder import seed_modules_cms
from src.database.seeders.platform_admin_seeder import seed_platform_admin

from src.database.seeders.customer_seeder import seed_cms_customers
from src.database.seeders.floor_plan_seeder import seed_floor_plan
from src.database.seeders.inventory_category_seeder import seed_inventory_categories
from src.database.seeders.inventory_seeder import seed_inventories
from src.database.seeders.inventory_units_seeder import seed_inventory_units
from src.database.seeders.order_seeder import seed_cms_orders
from src.database.seeders.recipe_category_seeder import seed_recipe_categories
from src.database.seeders.recipe_seeder import seed_cms_recipes

from src.database.seeders.tenant_defaults_seeder import seed_tenant_defaults
from src.database.seeders.tenant_seeder import seed_tenants


## Reference data identical for every tenant, and that no tenant row can be
## built without. Seeded once, with no tenant in context.
def seed_global_reference_data():
    print(">>>>> Seeding global reference data")
    seed_login_sliders()
    seed_enums()
    seed_currencies("src/database/sql/currencies.sql")
    seed_countries_states_cities("src/database/sql/countries_states_cities.sql")
    ## The module tree is global. It MUST be here, before any tenant's roles,
    ## because role_seeder resolves permissions against the live modules table.
    seed_modules_cms()
    ## The platform admin manages tenants, so it exists ahead of them and is
    ## seeded once, globally. See platform_admin_seeder for why it is not
    ## per-tenant like the accounts inside `users`.
    seed_platform_admin()


## Demo domain data for the tenant currently in scope. This is what turns the
## dashboard, KDS and reports from well-formed empty payloads into readable ones
## on a fresh install. A production tenant does not need it.
def seed_tenant_domain_data():
    print(">>>>> Seeding tenant domain data")
    seed_inventory_units()
    seed_inventory_categories()
    seed_inventories()
    seed_recipe_categories()
    ## Floor plan before customers: a customer has a preferred_table_id, and
    ## orders reference both.
    seed_floor_plan()
    seed_cms_customers()
    ## Recipes after inventory and categories: ingredient lines resolve against
    ## both by name.
    seed_cms_recipes()
    ## Orders last: every report, the dashboard and the POS summary read them.
    seed_cms_orders()


def run_base_seeders():
    print("Seeding CMS base data")

    seed_global_reference_data()

    for tenant in seed_tenants():
        print(f">>>>> Seeding tenant '{tenant['slug']}' (id={tenant['id']})")
        ## Every call under here writes rows stamped with this tenant, and every
        ## query the seeders run is confined to it. Leaving the scope restores
        ## the (empty) outer context, so the next tenant does not inherit it.
        with tenant_scope(tenant["id"], tenant["timezone"]):
            seed_tenant_defaults(tenant["currency"])
            seed_tenant_domain_data()

    print("***** Base seeders executed successfully. *****")


if __name__ == "__main__":
    run_base_seeders()
