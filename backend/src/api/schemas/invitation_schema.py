"""Payload shapes for the two public invitation endpoints.

Both live on the tenant-facing blueprint and accept no credentials: the
token IS the credential, which is why it is validated for shape here (a
pasted URL fragment, a truncated copy) and looked up by hash in the service.
The password field is the shared one, so an invitation-set password obeys
exactly the same length rules as a self-set one.
"""
from marshmallow import fields, validate

from src.api.schemas.base import BaseSchema
from src.api.schemas.fields.password import update_password_field


## `secrets.token_urlsafe(32)` is 43 chars; the bounds accept that with room
## for future growth while rejecting an obviously wrong value before it
## reaches a query.
TOKEN_LENGTH_BOUNDS = dict(min=32, max=512)


class InvitationTokenSchema(BaseSchema):
    """Preview: show the accept page whose invitation it is before asking
    for a password."""
    token = fields.String(
        required=True, allow_none=False,
        validate=validate.Length(
            error="The invitation token has an invalid length.",
            **TOKEN_LENGTH_BOUNDS,
        ),
        error_messages={
            "required": "Invitation token is required",
            "null": "Invitation token cannot be null",
        },
    )


class AcceptInvitationSchema(InvitationTokenSchema):
    """Accept: the token, plus the password the administrator is choosing."""
    password = update_password_field("Password")
