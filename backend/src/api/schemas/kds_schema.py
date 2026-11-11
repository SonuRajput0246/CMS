from marshmallow import fields, validate, validates_schema, ValidationError

from src.api.schemas.base import BaseSchema
from src.api.schemas.id_schema import id_schema_factory
from src.api.models.order_model import PREP_STATUS_SETTABLE


GetOrderByIdForKdsSchema = id_schema_factory("order_id", "Order Id")
GetOrderItemByIdForKdsSchema = id_schema_factory("order_item_id", "Order Item Id")


class GetKdsTicketsSchema(BaseSchema):
    """The kitchen queue.

    Defaults to every station so an unconfigured screen still shows work rather
    than an empty board; pass station to run one screen per pass.
    """
    station = fields.String(
        required=False, allow_none=True,
        validate=validate.Length(max=30, error="Station is too long"),
        error_messages={"invalid": "Invalid station"}
    )
    ## Newest ticket last by default, which is the order work should be done in.
    order_by = fields.String(
        required=False, allow_none=False,
        load_default="oldest_first",
        validate=validate.OneOf(
            ["oldest_first", "newest_first"],
            error="Order by must be oldest_first or newest_first"
        ),
        error_messages={"invalid": "Invalid order_by value"}
    )
    ## Overdue-first is the cook's real need: sort by how long it has been
    ## waiting rather than by id.
    include_ready = fields.Boolean(
        required=False, allow_none=False, load_default=False
    )


class UpdatePrepStatusSchema(BaseSchema):
    """Move one line through the kitchen.

    The item id is the body payload and the order comes from the path; the
    service re-checks that the item really belongs to that order so a mismatched
    pair cannot advance an unrelated line.
    """
    order_item_id = fields.Integer(
        required=True,
        validate=validate.Range(min=1, error="Order Item Id must be greater than 0"),
        error_messages={"required": "Order Item Id is required", "invalid": "Invalid Order Item Id"}
    )
    prep_status = fields.String(
        required=True,
        validate=validate.OneOf(PREP_STATUS_SETTABLE, error="Invalid prep status"),
        error_messages={"required": "Prep status is required", "invalid": "Invalid prep status"}
    )


class UndoBumpSchema(BaseSchema):
    """Put recently bumped lines back in the queue.

    The ids come from the bump response, so an undo can only touch the lines
    that bump actually plated -- not everything at that station.
    """
    order_id = fields.Integer(
        required=True,
        validate=validate.Range(min=1, error="Order Id must be greater than 0"),
        error_messages={"required": "Order Id is required", "invalid": "Invalid Order Id"}
    )
    order_item_ids = fields.List(
        fields.Integer(),
        required=True,
        validate=validate.Length(min=1, error="At least one item is required"),
        error_messages={"required": "Order item ids are required", "invalid": "Invalid order item ids"}
    )


class UpdateKdsPolicySchema(BaseSchema):
    """The tenant's board settings.

    All three travel together: the dialog edits one policy, and a partial
    update would let the amber band drift past the red one between saves.
    """
    wait_warn_minutes = fields.Integer(
        required=True,
        validate=validate.Range(min=1, max=120, error="Amber band must be 1-120 minutes"),
        error_messages={"required": "Amber band is required", "invalid": "Invalid amber band"}
    )
    wait_late_minutes = fields.Integer(
        required=True,
        validate=validate.Range(min=2, max=240, error="Red band must be 2-240 minutes"),
        error_messages={"required": "Red band is required", "invalid": "Invalid red band"}
    )
    poll_seconds = fields.Integer(
        required=True,
        validate=validate.Range(min=3, max=60, error="Refresh interval must be 3-60 seconds"),
        error_messages={"required": "Refresh interval is required", "invalid": "Invalid refresh interval"}
    )

    @validates_schema
    def ordered_bands(self, data, **kwargs):
        warn = data.get("wait_warn_minutes")
        late = data.get("wait_late_minutes")
        if warn is not None and late is not None and warn >= late:
            raise ValidationError(
                "The red band must be later than the amber band.",
                field_name="wait_late_minutes"
            )


class BumpOrderSchema(BaseSchema):
    """Mark every still-cooking line on one ticket as ready.

    Used by the KDS "bump" button when a whole table goes out together.
    """
    order_id = fields.Integer(
        required=True,
        validate=validate.Range(min=1, error="Order Id must be greater than 0"),
        error_messages={"required": "Order Id is required", "invalid": "Invalid Order Id"}
    )
    station = fields.String(
        required=False, allow_none=True,
        validate=validate.Length(max=30, error="Station is too long"),
        error_messages={"invalid": "Invalid station"}
    )