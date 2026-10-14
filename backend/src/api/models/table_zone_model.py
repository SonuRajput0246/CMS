from sqlalchemy import String, Boolean, Integer, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.database.base_model import BaseTenantModel
from typing import TYPE_CHECKING, List

if TYPE_CHECKING:
    from src.api.models.table_model import Table


class TableZone(BaseTenantModel):
    __tablename__ = "table_zones"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    display_name: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="1")

    # Relationships
    tables: Mapped[List["Table"]] = relationship(
        "Table",
        back_populates="zone",
        cascade="all, delete-orphan"
    )

    __table_args__ = (
        ## Was UNIQUE(name) globally. "Main Hall" exists in every cafe, so the
        ## constraint has to include the tenant.
        UniqueConstraint("tenant_id", "name", name="uq_table_zone_tenant_name"),

        Index("ix_table_zones_tenant", "is_deleted", "tenant_id", "id"),

        Index("ix_table_zone_active_order", "is_deleted", "is_active", "display_order", "id"),
        Index("ix_table_zone_name", "is_deleted", "name"),
    )

    def __repr__(self):
        return f"TableZone(id={self.id}, name={self.name}, display_name={self.display_name})"
