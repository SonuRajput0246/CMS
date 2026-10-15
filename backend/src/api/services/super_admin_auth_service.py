"""Platform sign-in, profile and logout.

Mirrors the shape of `auth_service.AuthService` (same `service_response`
returns, same single-live-session rule, same revocation idea) without reusing
its code, because the two authenticate different principals: this one has no
tenant, no menu tree and no role. Sharing the implementation would mean every
line of the tenant path had to learn about a case it does not have.
"""
import uuid
from datetime import datetime, timezone, timedelta

import jwt
from flask import current_app

from src.api.extensions import bcrypt
from src.api.models.super_admin_token_model import SuperAdminToken
from src.api.models.super_admin_user_model import SuperAdminUser
from src.api.middlewares.super_admin_auth import SUPER_ADMIN_SCOPE
from src.api.utils.responses import service_response


class SuperAdminAuthService:
    def __init__(self, db):
        self.db = db

    def login(self, data: dict):
        """Verify credentials and issue a platform token.

        The email lookup is deliberately unfiltered and the failure message
        generic: there is one account class here, so there is nothing to learn
        from "no such account" versus "wrong password".
        """
        email = data["email"].strip().lower()
        admin = (
            self.db.query(SuperAdminUser)
            .filter(SuperAdminUser.email == email, SuperAdminUser.is_deleted == False)
            .first()
        )

        if not admin or not bcrypt.check_password_hash(
            admin.password.encode("utf-8"), data["password"].encode("utf-8")
        ):
            return service_response(False, "Invalid email or password.", None, 401)

        if not admin.is_active:
            return service_response(
                False, "This account is deactivated. Contact another administrator.", None, 403
            )

        access_token = self._mint_token(admin)

        ## Single live session per admin, matching the tenant login. Revoking
        ## the predecessors here is what makes a second sign-in cut the first
        ## off rather than leaving it running alongside.
        self.db.query(SuperAdminToken).filter(
            SuperAdminToken.super_admin_id == admin.id,
            SuperAdminToken.is_revoked == False,
        ).update({"is_revoked": True})

        self.db.add(SuperAdminToken(
            super_admin_id=admin.id,
            access_token=access_token,
            is_revoked=False,
        ))
        self.db.commit()

        return service_response(
            True,
            "Login successful.",
            {"access_token": access_token, "profile": self.serialize(admin)},
            200,
        )

    def _mint_token(self, admin: SuperAdminUser) -> str:
        expires_in = current_app.config.get("SUPER_ADMIN_TOKEN_EXPIRES_MIN", 60)
        return jwt.encode(
            {
                ## String subject, per RFC 7519. Parsed back in
                ## middlewares/super_admin_auth.py.
                "sub": str(admin.id),
                "scope": SUPER_ADMIN_SCOPE,
                "email": admin.email,
                "iat": datetime.now(timezone.utc),
                "exp": datetime.now(timezone.utc) + timedelta(minutes=expires_in),
                ## Distinct per issuance, so two sign-ins inside one second
                ## cannot produce byte-identical tokens (see auth_service for
                ## the failure that causes).
                "jti": uuid.uuid4().hex,
            },
            current_app.config["JWT_SECRET_KEY"],
            algorithm=current_app.config["JWT_ALGORITHM"],
        )

    def me(self, admin):
        return service_response(
            True, "Profile fetched successfully.", self.serialize(admin), 200
        )

    def logout(self, admin_id: int):
        ## Revokes on the server. Clearing the frontend copy alone would leave
        ## a copied token usable until it expires -- see super_admin_tokens.
        self.db.query(SuperAdminToken).filter(
            SuperAdminToken.super_admin_id == admin_id,
            SuperAdminToken.is_revoked == False,
        ).update({"is_revoked": True})
        self.db.commit()
        return service_response(True, "Logged out successfully.", None, 200)

    @staticmethod
    def serialize(admin: SuperAdminUser) -> dict:
        """Wire shape for a platform admin. No password, no MFA secret."""
        return {
            "id": admin.id,
            "first_name": admin.first_name,
            "last_name": admin.last_name,
            "email": admin.email,
            "is_active": admin.is_active,
            "last_password_update_at": (
                admin.last_password_update_at.isoformat()
                if admin.last_password_update_at
                else None
            ),
        }
