from marshmallow_sqlalchemy import SQLAlchemyAutoSchema

from src.api.models.super_admin_user_model import SuperAdminUser
from src.api.schemas.base import BaseSchema
from src.api.schemas.mixins.email_mixin import EmailFieldMixin
from src.api.schemas.mixins.password_mixin import PasswordVerifyMixin


class SuperAdminLoginSchema(BaseSchema, EmailFieldMixin, PasswordVerifyMixin):
    """Platform sign-in. Same field construction as the tenant LoginSchema so
    both screens enforce the same password rules; it is a distinct class
    because it is a distinct endpoint and a distinct population."""
    pass


class SuperAdminResponseSchema(SQLAlchemyAutoSchema):
    """Wire shape for a platform admin.

    `password` and `mfa_secret` are both excluded -- they are the two columns
    that must never leave the server.
    """
    class Meta:
        model = SuperAdminUser
        load_instance = True
        include_relationships = False
        exclude = ("password", "mfa_secret")
