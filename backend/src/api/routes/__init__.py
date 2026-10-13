"""HTTP layer (blueprints).

Do NOT import every module here. Several modules import each other and some
reach into models that reference back, so eager imports create cycles.

Import the specific module you need directly:

    from src.api.routes.auth_route import auth_bp

Each route module also holds the `add_url_rule` calls that register its view
functions on the blueprint, and every authenticated view is wrapped in
`requires_module(...)` or `requires_module(SELF_SERVICE)` -- see
src/api/middlewares/authorization.py.
"""
