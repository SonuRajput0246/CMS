from marshmallow import ValidationError, fields, validate, validates_schema

from src.api.schemas.base import BaseSchema
from src.api.schemas.fields.password import update_password_field
from src.api.schemas.pagination_schema import PaginationSchema


## The slug becomes a subdomain: `demo1` is reached at demo1.localhost.
## lowercase, digits and hyphens, not starting or ending with a hyphen, so it
## is a valid DNS label and a readable URL. 2..50 chars matches the column.
SLUG_REGEX = r"^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$"

CURRENCY_REGEX = r"^[A-Za-z]{3}$"


class ListTenantsSchema(PaginationSchema):
    """Tenant list query. Adds a status facet on top of the shared pagination.

    `status` is a facet rather than two booleans so the UI's Active/Inactive/
    Archived tabs map onto exactly one filter each, and an unrecognised value
    is rejected instead of silently ignored.
    """
    status = fields.String(
        required=False,
        allow_none=True,
        validate=validate.OneOf(
            ["active", "inactive", "archived"],
            error="Status must be 'active', 'inactive' or 'archived'.",
        ),
    )


def _slug_field(required: bool):
    return fields.String(
        required=required,
        allow_none=False,
        validate=[
            validate.Length(
                min=2, max=50,
                error="Slug must be between 2 and 50 characters long",
            ),
            validate.Regexp(
                regex=SLUG_REGEX,
                error=(
                    "Slug must be lowercase letters, numbers and hyphens, "
                    "and must start and end with a letter or number"
                ),
            ),
        ],
        error_messages={
            "required": "Slug is required",
            "null": "Slug cannot be null",
        },
    )


def _timezone_field(required: bool):
    return fields.String(
        required=required,
        allow_none=False,
        validate=validate.Length(
            min=1, max=50,
            error="Timezone must be between 1 and 50 characters long",
        ),
        error_messages={
            "required": "Timezone is required",
            "null": "Timezone cannot be null",
        },
    )


def _currency_field(required: bool):
    return fields.String(
        required=required,
        allow_none=False,
        validate=validate.Regexp(
            regex=CURRENCY_REGEX,
            error="Currency must be a 3-letter ISO 4217 code",
        ),
        error_messages={
            "required": "Currency is required",
            "null": "Currency cannot be null",
        },
    )


class CreateTenantSchema(BaseSchema):
    """Register a hotel and its first administrator in one call.

    The administrator's fields are named with an `admin_` prefix rather than
    being nested, because the screen that gathers them is one form: keeping
    them flat means the payload the browser sends has no invented shape.

    `admin_mode` chooses how that first account comes to exist:

      * `owner` (direct) -- `admin_password` is required, and the backend
        creates the account immediately as the tenant's OWNER. Nothing is
        emailed, so the operator hands the credential over themselves.
      * `invitation` (the default) -- no password. The backend issues a
        single-use invitation (src/api/services/tenant_invitation_service.py)
        and the administrator chooses their own password on the accept page.

    The default keeps every older client working: a payload with no
    `admin_mode` still gets the invitation. The password is rejected when it
    is not meaningful, rather than silently ignored, so an operator is never
    left believing they set a credential that was never stored.
    """
    name = fields.String(
        required=True, allow_none=False,
        validate=validate.Length(min=1, max=120, error="Name must be between 1 and 120 characters long"),
        error_messages={"required": "Name is required", "null": "Name cannot be null"},
    )
    slug = _slug_field(required=True)
    timezone = _timezone_field(required=True)
    currency = _currency_field(required=True)

    admin_first_name = fields.String(
        required=True, allow_none=False,
        validate=validate.Length(min=1, max=50, error="Admin first name must be between 1 and 50 characters long"),
        error_messages={"required": "Admin first name is required", "null": "Admin first name cannot be null"},
    )
    admin_last_name = fields.String(
        required=True, allow_none=False,
        validate=validate.Length(min=1, max=50, error="Admin last name must be between 1 and 50 characters long"),
        error_messages={"required": "Admin last name is required", "null": "Admin last name cannot be null"},
    )
    admin_email = fields.Email(
        required=True, allow_none=False,
        validate=validate.Length(max=255, error="Admin email must be less than 255 characters"),
        error_messages={"required": "Admin email is required", "null": "Admin email cannot be null",
                        "invalid": "Invalid admin email address"},
    )
    admin_mode = fields.String(
        required=False, allow_none=False,
        load_default="invitation",
        validate=validate.OneOf(
            ["owner", "invitation"],
            error="Admin mode must be 'owner' or 'invitation'",
        ),
        error_messages={"null": "Admin mode cannot be null"},
    )
    ## Only meaningful in `owner` mode -- enforced below rather than by
    ## `required=True`, which would break the invite path and every older
    ## client that sends no mode at all.
    admin_password = update_password_field("Admin password", required=False)

    @validates_schema
    def validate_admin_credentials(self, data, **kwargs):
        mode = data.get("admin_mode", "invitation")
        password = data.get("admin_password")

        if mode == "owner" and not password:
            raise ValidationError(
                "A password is required when the owner is created directly.",
                field_name="admin_password",
            )
        if mode != "owner" and password:
            raise ValidationError(
                "A password can only be sent when the owner is created "
                "directly; an invitation lets them choose their own.",
                field_name="admin_password",
            )


class UpdateTenantSchema(BaseSchema):
    """Partial edit. Everything optional so a screen can submit one changed
    field; the service only touches what is actually present.

    `slug` is deliberately included: it is the tenant's URL, so changing it
    moves the hotel to a different subdomain. The service treats that as the
    sensitive change it is and reports it in the audit log.
    """
    name = fields.String(required=False, allow_none=False,
                         validate=validate.Length(min=1, max=120, error="Name must be between 1 and 120 characters long"))
    slug = _slug_field(required=False)
    timezone = _timezone_field(required=False)
    currency = _currency_field(required=False)


class TenantStatusSchema(BaseSchema):
    """Activate/deactivate body. One boolean, read as a verb by the caller."""
    is_active = fields.Boolean(
        required=True,
        error_messages={"required": "is_active is required", "null": "is_active cannot be null"},
    )
