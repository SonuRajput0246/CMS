from flask import Flask
from flask_cors import CORS
from src.config import get_config
from src.api.extensions import bcrypt
from src.database.session import db_session
from src.api.utils.error_handlers import register_error_handlers

## Shared infrastructure routes, then the cafe domain routes. Every blueprint
## below is registered unconditionally -- this app is CMS only, so there is no
## instance gate and no route tree that differs between deployments.
from src.api.routes.auth_route import auth_bp
from src.api.routes.user_route import user_bp
from src.api.routes.admin_route import admin_bp
from src.api.routes.common_route import common_bp
from src.api.routes.user_account_route import account_bp
from src.api.routes.template_route import template_bp
from src.api.routes.inventory_route import inventory_bp

### CMS (Cafe Management System) routes
from src.api.routes.table_zone_route import table_zone_bp
from src.api.routes.table_route import table_bp
from src.api.routes.customer_route import customer_bp
from src.api.routes.order_route import order_bp
from src.api.routes.recipe_category_route import recipe_category_bp
from src.api.routes.recipe_route import recipe_bp
from src.api.routes.recipe_ingredient_route import recipe_ingredient_bp
from src.api.routes.kds_route import kds_bp
from src.api.routes.pos_route import pos_bp
from src.api.routes.report_route import report_bp

## Timestamps and soft-delete stamps are registered once, globally, in
## src/api/events/base_events.py, which the model registry (src.api.models)
## imports for its side effect at its bottom. Nothing needs importing here: the
## route imports above pull in services, which import the registry. Registering
## listeners only from app.py is what made created_at a NOT NULL violation
## waiting for the first non-Flask caller -- a seeder, alembic, a script.


def create_app():
    app = Flask(__name__)

    ## Load configuration
    app.config.from_object(get_config())

    ## Enable CORS
    CORS(
        app,
        resources={r"/*": {"origins": [
            "http://localhost:4200",
            r"http://[a-z0-9-]+\.localhost:4200$",
        ]}},
        supports_credentials=True
    )

    ## Initialize extensions
    bcrypt.init_app(app)

    ## Register blueprints
    ##
    ## Every blueprint is registered unconditionally. This used to be gated on
    ## an INSTANCE_TYPE switch so one codebase could serve either product; the
    ## hotel half is gone, so the gate had nothing left to decide.
    app.register_blueprint(auth_bp, url_prefix="/api/v1/auth")
    app.register_blueprint(user_bp, url_prefix="/api/v1/user")
    app.register_blueprint(admin_bp, url_prefix="/api/v1/admin")
    app.register_blueprint(common_bp, url_prefix="/api/v1/common")
    app.register_blueprint(account_bp, url_prefix="/api/v1/user-account")
    app.register_blueprint(template_bp, url_prefix="/api/v1/template")

    ## Inventory is shared with the CMS domain, not a leftover of the hotel
    ## one. Recipe.calculate_cost_from_ingredients() multiplies each ingredient
    ## quantity by Inventory.unit_cost, and the recipe ingredient grid fetches
    ## its options from /inventory/get -- so the menu cannot be priced without
    ## these endpoints.
    app.register_blueprint(inventory_bp, url_prefix="/api/v1/inventory")

    app.register_blueprint(table_zone_bp, url_prefix="/api/v1/table-zone")
    app.register_blueprint(table_bp, url_prefix="/api/v1/table")
    app.register_blueprint(customer_bp, url_prefix="/api/v1/customer")
    app.register_blueprint(order_bp, url_prefix="/api/v1/order")
    app.register_blueprint(recipe_category_bp, url_prefix="/api/v1/recipe-category")
    app.register_blueprint(recipe_bp, url_prefix="/api/v1/recipe")
    app.register_blueprint(recipe_ingredient_bp, url_prefix="/api/v1/recipe-ingredient")
    app.register_blueprint(kds_bp, url_prefix="/api/v1/kds")
    app.register_blueprint(pos_bp, url_prefix="/api/v1/pos")
    app.register_blueprint(report_bp, url_prefix="/api/v1/report")

    @app.teardown_appcontext
    def shutdown_session(exception=None):
        """
        Ensures that the database session is removed at the end of every request.
        This releases the connection back to the SQLAlchemy pool.
        """
        db_session.remove()

    ## Error Handler
    register_error_handlers(app)


    return app
