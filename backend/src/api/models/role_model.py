from typing import TYPE_CHECKING
from src.database.base_model import BaseTenantModel
from sqlalchemy import String, Boolean, Index, UniqueConstraint
from sqlalchemy.orm import relationship, Mapped, mapped_column

if TYPE_CHECKING:
    from src.api.models.user_model import User
    from src.api.models.role_module_access_model import RoleModuleAccess


class Role(BaseTenantModel):
    __tablename__ = 'roles'

    id: Mapped[int] = mapped_column(primary_key=True)
    role_code: Mapped[str] = mapped_column(String(50), nullable=False)
    role_name: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


    ## Relationship: Role -> RoleModuleAccess (one-to-many)
    module_access: Mapped[list["RoleModuleAccess"]] = relationship(
        back_populates="role",
        cascade="all, delete-orphan"
    )

    ## Relationship: Role -> User (one-to-many)
    users: Mapped[list["User"]] = relationship(
        back_populates="role"
    )

    __table_args__ = (
          ## Was UNIQUE(role_code). That is one global set of roles, which cannot
          ## hold two tenants both having an "ADMIN". Scoping the constraint to
          ## the tenant is what lets each cafe define its own roles while
          ## role_code stays a stable key for the seeders and for the
          ## OWNER lookups in the service layer.
          UniqueConstraint("tenant_id", "role_code", name="uq_role_tenant_code"),

          ## The read path for almost everything: this tenant's live rows.
          Index("ix_roles_tenant", "is_deleted", "tenant_id", "id"),

          ## Login resolves a role by code within a tenant.
          Index("ix_role_tenant_code_lookup", "tenant_id", "is_deleted", "role_code"),
          Index("ix_active_role_name_id", "is_deleted", "role_name", "id"),
    )

    def __repr__(self):
        return f"Role(id={self.id}, role_code={self.role_code}, role_name={self.role_name})"
