"""Service layer.

Do NOT import every module here. Several modules import each other and some
reach into models that reference back, so eager imports create cycles.

Import the specific service you need directly:

    from src.api.services.common_service import CommonService

A service owns the business rules for one domain and is the only thing that
should write to its tables; routes validate and delegate, models map columns.
"""
