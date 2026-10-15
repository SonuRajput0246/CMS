from marshmallow import fields, validate


class TenantFieldMixin:
    """Adds the tenant login code to a public auth payload.

    Every unauthenticated endpoint that looks a user up by email needs this.
    `users.email` is unique only within a tenant, so an email on its own does
    not identify an account: the same address may belong to staff at two cafes.
    The slug names the tenant the caller believes they belong to, and the
    service resolves it and confines the lookup to that tenant.

    Declared once here so the field, its bounds and its message stay identical
    across the register/login/OTP/reset payloads.
    """

    tenant_slug = fields.String(
        required=True,
        validate=validate.Length(min=1, max=50),
        error_messages={"required": "Company code is required."},
    )
