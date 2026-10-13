"""Marshmallow schemas.

Do NOT import every module here. Several modules import each other and some
reach into models that reference back, so eager imports create cycles.

Import the specific schema you need directly:

    from src.api.schemas.common_schema import GetAllStatesSchema

Sub-packages here are not domain buckets but kinds of schema:

    fields/      single reusable field types (email, phone, otp, date, ...)
    mixins/      field groups composed into a concrete schema
    validators/  reusable Marshmallow validators

`base.py` holds BaseSchema, which every request schema inherits for the shared
whitespace normalisation in `@pre_load`.
"""
