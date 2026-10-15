"""Platform (super admin) HTTP layer.

Separate blueprint, separate URL space (`/api/super-admin`), separate guard.
The split is the whole point: these views run with no tenant bound, so they
must never share a wrapper with a path that resolves one.

Route order is deliberately public-first: `/auth/login` is the single endpoint
that accepts an unauthenticated caller, and every other rule carries
`@requires_super_admin`. There is no `requires_module` here -- that decorator
resolves grants from `role_module_access`, which is per-tenant, and a platform
admin has no tenant's role. Membership in `super_admin_users` is the grant.

These routes carry neither `__required_module__` nor `__auth_only__`: those
mark a tenant-module contract this view does not take part in, so
scripts/audit_authorization.py classifies them as public rather than reporting
a platform route as an undeclared *tenant* endpoint.
"""
from flask import Blueprint, g, jsonify, request

from src.api.middlewares.super_admin_auth import requires_super_admin
from src.api.schemas.super_admin_schema import SuperAdminLoginSchema
from src.api.schemas.tenant_management_schema import (
    CreateTenantSchema,
    ListTenantsSchema,
    TenantStatusSchema,
    UpdateTenantSchema,
)
from src.api.services.super_admin_auth_service import SuperAdminAuthService
from src.api.services.tenant_management_service import TenantManagementService
from src.database.session import db_session

super_admin_bp = Blueprint("super_admin", __name__)


class SuperAdminRoute:
    def __init__(self, auth_service, tenant_service):
        self.auth_service = auth_service
        self.tenant_service = tenant_service

    ## ----------------------------------------------------------------- auth
    def login(self):
        ## The one public view on this blueprint: it cannot require a token it
        ## is about to issue. No tenant is resolved anywhere on this path.
        payload = request.get_json() or {}
        validated_data = SuperAdminLoginSchema().load(payload)
        result, status_code = self.auth_service.login(validated_data)
        return jsonify(result), status_code

    @requires_super_admin
    def me(self):
        result, status_code = self.auth_service.me(g.current_super_admin)
        return jsonify(result), status_code

    @requires_super_admin
    def logout(self):
        ## Reaches past the request token to the row that authorises it, so a
        ## copied bearer token dies with this session.
        result, status_code = self.auth_service.logout(g.current_super_admin.id)
        return jsonify(result), status_code

    ## ------------------------------------------------------------- dashboard
    @requires_super_admin
    def dashboard_summary(self):
        result, status_code = self.tenant_service.dashboard_summary()
        return jsonify(result), status_code

    ## -------------------------------------------------------------- tenants
    @requires_super_admin
    def list_tenants(self):
        ## GET with query parameters. The tenant-side lists are POST bodies,
        ## but this one is a plain read that the panel's filters address
        ## directly, and a 404 here means "no such tab", not "no such row".
        validated_data = ListTenantsSchema().load(request.args.to_dict())
        result, status_code = self.tenant_service.get_tenants(validated_data)
        return jsonify(result), status_code

    @requires_super_admin
    def create_tenant(self):
        validated_data = CreateTenantSchema().load(request.get_json() or {})
        result, status_code = self.tenant_service.create_tenant(
            validated_data, g.current_super_admin
        )
        return jsonify(result), status_code

    @requires_super_admin
    def get_tenant(self, tenant_id):
        result, status_code = self.tenant_service.get_tenant_by_id(tenant_id)
        return jsonify(result), status_code

    @requires_super_admin
    def update_tenant(self, tenant_id):
        validated_data = UpdateTenantSchema().load(request.get_json() or {})
        result, status_code = self.tenant_service.update_tenant(
            tenant_id, validated_data, g.current_super_admin
        )
        return jsonify(result), status_code

    @requires_super_admin
    def set_tenant_status(self, tenant_id):
        validated_data = TenantStatusSchema().load(request.get_json() or {})
        result, status_code = self.tenant_service.set_tenant_status(
            tenant_id, validated_data["is_active"], g.current_super_admin
        )
        return jsonify(result), status_code

    @requires_super_admin
    def archive_tenant(self, tenant_id):
        result, status_code = self.tenant_service.archive_tenant(
            tenant_id, g.current_super_admin
        )
        return jsonify(result), status_code

    @requires_super_admin
    def restore_tenant(self, tenant_id):
        result, status_code = self.tenant_service.restore_tenant(
            tenant_id, g.current_super_admin
        )
        return jsonify(result), status_code


## Instantiate services, then wrap their handlers in the platform guard.
super_admin_auth_service = SuperAdminAuthService(db=db_session)
tenant_management_service = TenantManagementService(db=db_session)
super_admin_route = SuperAdminRoute(
    auth_service=super_admin_auth_service, tenant_service=tenant_management_service
)

## Public auth.
super_admin_bp.add_url_rule("/auth/login", view_func=super_admin_route.login, methods=["POST"])

## Everything below requires a platform token.
super_admin_bp.add_url_rule("/auth/me", view_func=super_admin_route.me, methods=["GET"])
super_admin_bp.add_url_rule("/auth/logout", view_func=super_admin_route.logout, methods=["POST"])

super_admin_bp.add_url_rule(
    "/dashboard/summary", view_func=super_admin_route.dashboard_summary, methods=["GET"]
)

## Two rules on /tenants, distinguished by method: read vs register.
super_admin_bp.add_url_rule("/tenants", view_func=super_admin_route.list_tenants, methods=["GET"])
super_admin_bp.add_url_rule("/tenants", view_func=super_admin_route.create_tenant, methods=["POST"])
super_admin_bp.add_url_rule(
    "/tenants/<int:tenant_id>", view_func=super_admin_route.get_tenant, methods=["GET"]
)
super_admin_bp.add_url_rule(
    "/tenants/<int:tenant_id>", view_func=super_admin_route.update_tenant, methods=["PATCH"]
)
super_admin_bp.add_url_rule(
    "/tenants/<int:tenant_id>/status", view_func=super_admin_route.set_tenant_status, methods=["PATCH"]
)
super_admin_bp.add_url_rule(
    "/tenants/<int:tenant_id>/archive", view_func=super_admin_route.archive_tenant, methods=["POST"]
)
super_admin_bp.add_url_rule(
    "/tenants/<int:tenant_id>/restore", view_func=super_admin_route.restore_tenant, methods=["POST"]
)
