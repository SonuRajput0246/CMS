"""SQLAlchemy model registry.

Import order is load-bearing, not cosmetic: `relationship()` targets must
already be in the declarative registry when a child class body executes, so
parents are imported before their children. Order models reference
recipes/inventory/tables/customers, and those reference back (order ->
table.orders, recipe.ingredients), so importing the domain models in an
arbitrary order creates circular imports.

This module must import every mapped class before create_all()/alembic runs.
Any entry point that touches models -- app.py, alembic env, seeders -- imports
it and therefore gets the full registry.

Outside this registry, import the specific model you need directly rather than
relying on this file, to keep the cycles above out of the caller's import
graph:

    from src.api.models.order_model import CMSOrder
    from src.api.models.table_model import Table
    from src.api.models.customer_model import Customer
    from src.api.models.recipe_model import Recipe
    from src.api.models.user_model import User

TENANCY
-------
Which tables carry `tenant_id` is decided entirely by their base class, never
by this file and never by hand:

  * `BaseTenantModel` -> the row belongs to one tenant. 22 tables.
  * `BaseModel` / `Base` -> shared reference data, identical for every tenant.
    8 tables: the geography and currency tables, the module/menu tree, the
    enum definitions, and the login carousel.

Read-side enforcement of the split is `src/api/tenancy/filters.py`, which
applies a `tenant_id` criterion to every BaseTenantModel subclass at query
time. Nothing in a service or a route has to remember to scope a query, and
the set of scoped tables cannot drift from this file: both are derived from the
same base class, so a model is scoped by what it inherits, not by a hand-kept
list.
"""

### The tenant itself. First of everything, because 22 tables below hold a
### foreign key to it and the FK needs the target in the registry.
from .tenant_model import Tenant

### Shared infrastructure: identity, access, inventory, reference data
from .role_model import Role
from .user_model import User
from .token_model import Token
from .email_otp_model import EmailOTP
from .module_model import Module
from .inventory_category_model import InventoryCategory
from .inventory_model import Inventory
from .account_deletions_model import AccountDeletions
from .login_sliders_model import LoginSliders
from .inventory_units_model import InventoryUnits
from .prefixes_model import Prefixes
from .country_model import Country
from .state_model import State
from .city_model import City
from .currency_model import Currency
from .system_setting_model import SystemSetting
from .template_model import Template
from .enum_definitions_model import EnumDefinition
from .enum_options_model import EnumOption
from .role_module_access_model import RoleModuleAccess

### CMS Models (Cafe Management System)
# NOTE: import order matters. Parents first so children's relationship()
# targets are already in the registry.
from .table_zone_model import TableZone
from .table_model import Table
from .customer_model import Customer
from .recipe_category_model import RecipeCategory
from .recipe_model import Recipe
from .recipe_ingredient_model import RecipeIngredient
from .document_sequence_model import DocumentSequence
from .order_model import (
    CMSOrder,
    CMSOrderItem,
    CMSPayment,
    OrderStatusEnum,
    OrderTypeEnum,
    PaymentStatusEnum,
    PaymentMethodEnum,
)

### Attach the timestamp / soft-delete listeners.
#
# Imported here, at the very bottom, so that ANY entry point which touches the
# models -- app.py, an alembic env, a seeder, a management command, a test --
# gets them. Registering them only from app.py made created_at a NOT NULL
# violation waiting for the first non-Flask caller.
#
# The bottom placement is what keeps this acyclic: base_events registers
# against the declarative Base, and by this line every subclass it applies to
# has been defined.
#
# event.listen dedupes on (target, identifier, fn), so app.py also importing
# this module is harmless.
from src.api.events import base_events  # noqa: E402,F401  (imported for side effect)

### Confine every ORM query to the current tenant.
#
# Same reasoning as base_events above: the listener registers against the ORM
# Session, so any entry point that imports the models -- app.py, alembic env, a
# seeder, a script -- gets tenant enforcement. No service opts in, and none can
# forget to.
from src.api.tenancy import filters  # noqa: E402,F401  (imported for side effect)
