"""Base seeding entry point.

Run with `python -m src.database.seeders.run_base_seeders` from backend/.

Reference and infrastructure data seeds first, then the module tree, then
roles, then the cafe domain data that depends on all of it.

Ordering constraint that is load-bearing: modules seed before roles.
role_seeder reads the live `modules` table and grants permissions only for
modules that exist, so seeding roles first silently produces roles with no
permissions.
"""
## No config is resolved here on purpose: the individual seeder modules read
## config at import time, so a misconfiguration already fails before any
## session is opened. This module only decides ordering.
from src.database.seeders.countries_states_cities_seeder import seed_countries_states_cities
from src.database.seeders.currencies_seeder import seed_currencies
from src.database.seeders.enum_seeder import seed_enums
from src.database.seeders.inventory_category_seeder import seed_inventory_categories
from src.database.seeders.inventory_seeder import seed_inventories
from src.database.seeders.inventory_units_seeder import seed_inventory_units
from src.database.seeders.login_slider_seeder import seed_login_sliders
from src.database.seeders.prefixes_seeder import seed_prefixes
from src.database.seeders.role_seeder import seed_roles
from src.database.seeders.super_admin_seeder import seed_super_admin
from src.database.seeders.system_setting_seeder import seed_system_settings
from src.database.seeders.template_seeder import seed_templates

from src.database.seeders.customer_seeder import seed_cms_customers
from src.database.seeders.floor_plan_seeder import seed_floor_plan
from src.database.seeders.module_seeder import seed_modules_cms
from src.database.seeders.recipe_category_seeder import seed_recipe_categories
from src.database.seeders.recipe_seeder import seed_cms_recipes
from src.database.seeders.order_seeder import seed_cms_orders


## Reference data every table depends on, and that domain data depends on.
def seed_reference_data():
    seed_login_sliders()
    seed_enums()
    seed_templates()
    seed_system_settings()
    seed_currencies("src/database/sql/currencies.sql")
    seed_countries_states_cities("src/database/sql/countries_states_cities.sql")
    seed_prefixes()
    seed_inventory_units()
    seed_inventory_categories()
    seed_inventories()


def run_cms_seeders():
    print(">>>>> Seeding CMS domain data")
    ## Modules are NOT seeded here -- run_base_seeders() does that before
    ## roles, because role_seeder resolves permissions against the live
    ## modules table.
    seed_recipe_categories()
    ## Floor plan before customers: the customer model has a
    ## preferred_table_id, and orders reference both.
    seed_floor_plan()
    seed_cms_customers()
    ## Recipes last: they resolve ingredient lines against inventory and
    ## categories by name, so both must already exist.
    seed_cms_recipes()
    ## Orders after everything they reference. Reports, the dashboard and the
    ## POS summary all read cms_orders, so this is what turns those screens
    ## from well-formed empty payloads into readable ones.
    seed_cms_orders()


def run_base_seeders():
    print("Seeding CMS base data")

    ## Reference data first: enums, currencies, countries and stock are inputs
    ## to everything below.
    seed_reference_data()

    ## Modules next, before roles. role_seeder reads the live `modules` table
    ## and grants permissions only for modules that exist, so seeding roles
    ## first silently produces roles with no permissions at all.
    print(">>>>> Seeding modules")
    seed_modules_cms()

    ## Now that modules exist, roles can resolve their permissions.
    seed_roles()
    seed_super_admin()

    ## Remaining shared tables, then the domain data.
    run_cms_seeders()

    print("***** Base seeders executed successfully. *****")


if __name__ == "__main__":
    run_base_seeders()