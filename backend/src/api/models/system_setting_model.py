from sqlalchemy import Integer, String, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column

from src.database.base_model import BaseTenantModel


class SystemSetting(BaseTenantModel):
    """Per-tenant key/value configuration.

    Was a global table keyed on `key` alone, which cannot work here: two cafes
    both want their own `default_currency` and there is no way to hold both. It
    now carries a surrogate `id` primary key with `UNIQUE(tenant_id, key)`
    instead of making `key` part of a composite primary key.

    The surrogate key is the deliberate choice over a composite PK. Every other
    table in this schema has a plain integer `id`, and services reach for
    `Setting.id`-shaped reasoning (and the seeder's
    `scalar_one_or_none()` on the natural key reads the same either way). A
    composite PK would make this the only table where the identifier is a
    string, which is the kind of inconsistency that costs someone an afternoon.

    Note this table has no reader in the service layer yet -- `default_currency`
    is seeded and never read. The tenant's `currency` column is the live source
    of truth for that, added with the tenancy work. This table is kept because
    it is the obvious home for per-tenant settings that do not warrant a column
    of their own, and because dropping a table mid-refactor loses the question
    it was answering.
    """
    __tablename__ = "system_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    key: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[str | None] = mapped_column(String(255), nullable=True)

    __table_args__ = (
        ## The lookup path: "this tenant's default_currency".
        UniqueConstraint("tenant_id", "key", name="uq_system_setting_tenant_key"),
        ## Leading with is_deleted matches every other index here.
        Index("ix_system_settings_tenant", "is_deleted", "tenant_id", "id"),
    )

    def __repr__(self):
        return f"<SystemSetting(tenant_id={self.tenant_id}, key={self.key!r}, value={self.value!r})>"
