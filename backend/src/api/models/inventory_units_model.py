from src.database.base_model import BaseTenantModel
from sqlalchemy import String, Boolean, Index
from sqlalchemy.orm import mapped_column, Mapped


class InventoryUnits(BaseTenantModel):
    __tablename__ = 'inventory_units'

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(10), nullable=False)
    label: Mapped[str] = mapped_column(String(20), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    __table_args__ = (
        Index("ix_inventory_units_tenant", "is_deleted", "tenant_id", "id"),
    )


    def __repr__(self):
        return f"Inventory Units(id={self.id}, name={self.code}, label={self.label})"
