from src.database.base_model import BaseTenantModel
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Boolean, Index, UniqueConstraint


class Prefixes(BaseTenantModel):
    __tablename__ = "prefixes"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(10), nullable=False)
    ## Unique per tenant, because document number generators resolve a prefix by
    ## purpose with scalar_one_or_none(), which raises MultipleResultsFound on a
    ## duplicate. The constraint is declared exactly once, in __table_args__:
    ## also passing `unique=True` on the column makes SQLAlchemy emit a SECOND
    ## constraint, and autogenerate then keeps trying to create both.
    ##
    ## Was UNIQUE(purpose) globally -- one prefix per purpose shared by every
    ## tenant. Per tenant, so each cafe picks its own order prefix.
    purpose: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    __table_args__ = (
        UniqueConstraint("tenant_id", "purpose", name="uq_prefixes_tenant_purpose"),
        Index("ix_prefixes_tenant", "is_deleted", "tenant_id", "id"),
    )

    def __repr__(self):
        return f"<Prefix(id={self.id}, code='{self.code}', purpose='{self.purpose}')>"
