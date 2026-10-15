from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

## Imported, not re-declared. src/database/base.py owns the single declarative
## Base -- a second `declarative_base()` here would give this module its own
## empty registry, and models built on it would be invisible to create_all()
## and to alembic autogenerate.
from src.database.base import Base

## Reading the context here couples the ORM base to the tenancy package, which
## is deliberate: this is the same source of truth the query filter reads, so a
## row is stamped with the tenant its queries will later be confined to. There
## is no import cycle -- tenancy.context imports only flask.
from src.api.tenancy.context import get_current_tenant_id


class BaseModel(Base):
    """
    Abstract base class for all models.
    It will not create a table in the DB (because __abstract__ = True).
    """
    __abstract__ = True

    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    deleted_at: Mapped[datetime | None] =  mapped_column(DateTime(timezone=True), nullable=True)


    def to_dict(self):
        """
        Helper to quickly serialize model data for debugging or simple APIs.
        """
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


def _tenant_id_default() -> int:
    """Stamp a new row with the tenant that is current when it is flushed.

    This is what makes row creation multi-tenant without editing every create
    path: the unit of work has already resolved a tenant (the login slug, or
    the JWT for an authenticated call) before it reaches the insert.

    It raises rather than inserting NULL when there is no tenant, so a create
    that escaped its tenant context fails closed and loudly, instead of writing
    an unowned row for the NOT NULL constraint to reject later with a message
    nobody can act on.
    """
    tenant_id = get_current_tenant_id()
    if tenant_id is None:
        raise RuntimeError(
            "Refusing to insert a tenant-scoped row: no tenant in context. "
            "Resolve one via tenancy.resolution.enter_tenant(), set it with "
            "set_current_tenant_id(), or pass tenant_id explicitly."
        )
    return tenant_id


class BaseTenantModel(BaseModel):
    """Base class for every model whose rows belong to exactly one tenant.

    Adding `tenant_id` here rather than to each model by hand is what makes the
    tenancy uniform: a model cannot be tenant-scoped in one place and global in
    another by accident, because the choice is made once, at the class
    declaration.

    `tenant_id` is NOT NULL and declared with a foreign key so the database
    refuses an orphan row. But the FK is a backstop, not the mechanism: it
    cannot stop `SELECT * FROM cms_orders` returning another tenant's orders.
    Read-side enforcement is src/api/tenancy/filters.py.

    Every subclass declares the standard `(is_deleted, tenant_id, id)` index
    in its own `__table_args__`, named `ix_<table>_tenant`. The name is
    per-table rather than shared because an index name must be unique across
    the whole database on SQLite, and a shared one makes `drop_index` and
    autogenerate ambiguous.
    """
    __abstract__ = True

    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id"),
        nullable=False,
        ## Python-side, so it adds nothing to the DDL and autogenerate sees no
        ## change. Every INSERT therefore stamps itself with the tenant the
        ## request is already confined to, and no create path in any service
        ## has to remember to set it. An explicit tenant_id -- the seeders and
        ## the tenant bootstrap -- overrides this.
        default=_tenant_id_default,
    )
