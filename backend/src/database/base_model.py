from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

## Imported, not re-declared. src/database/base.py owns the single declarative
## Base -- a second `declarative_base()` here would give this module its own
## empty registry, and models built on it would be invisible to create_all()
## and to alembic autogenerate.
from src.database.base import Base


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
    )
