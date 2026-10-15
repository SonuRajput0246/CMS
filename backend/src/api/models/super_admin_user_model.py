from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from src.database.base_model import BaseModel


class SuperAdminUser(BaseModel):
    """A platform operator: the account that manages tenants themselves.

    Deliberately NOT a `BaseTenantModel`: this account belongs to the platform,
    not to any one cafe. The tenant `users` table requires a `tenant_id` and is
    unique on `(tenant_id, email)`, so a global operator has no valid row there
    -- giving one a fabricated tenant would make it a customer account and drag
    it into every tenant-scoped query and JWT. Keeping it on `BaseModel` means
    the tenant filter never sees it, and a tenant JWT can never be minted from
    it (the tenant login only ever looks in `users`).

    Authentication is a separate path (`middlewares/super_admin_auth.py`) with a
    token scope of `super_admin`; the tenant middleware rejects it and this one
    rejects tenant tokens, so the two populations cannot cross.

    MFA fields are carried for parity with `User`; the login path does not yet
    enforce them.
    """
    __tablename__ = "super_admin_users"

    id: Mapped[int] = mapped_column(primary_key=True)
    first_name: Mapped[str] = mapped_column(String(50), nullable=False)
    last_name: Mapped[str] = mapped_column(String(50), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    password: Mapped[str] = mapped_column(String(128), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_password_update_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    mfa_secret: Mapped[str | None] = mapped_column(String(32), nullable=True)

    __table_args__ = (
        ## Platform admins are few and looked up only by email at sign-in.
        Index("ux_super_admin_email", "email", unique=True),
        ## The "list active admins" path, mirroring the tenant tables' shape.
        Index("ix_super_admin_active_id", "is_deleted", "is_active", "id"),
    )

    def __repr__(self):
        return f"<SuperAdminUser(id={self.id}, email={self.email!r})>"
