from sqlalchemy import select
from src.api.extensions import bcrypt
from src.api.models.user_model import User
from src.api.models.role_model import Role
from src.database.session import db_session
from datetime import datetime, timezone

## Demo fixture only. `provision_tenant` (the platform path) deliberately does
## not call this: a real tenant's first administrator is born when they accept
## the invitation. It runs on the demo seed path via `seed_tenant_defaults`.

## Configuration
ADMIN_EMAIL = "sonurajput8454@gmail.com"
ADMIN_PASSWORD = "123456"


def seed_tenant_owner():
    try:
        ## Get the Owner role. Matched on role_code, which is the stable key
        ## (see role_model): role_name is tenant-editable text, so filtering
        ## on it would break the moment a tenant renames the role.
        role_stmt = select(Role).filter_by(role_code="OWNER", is_deleted=False)
        owner_role = db_session.execute(role_stmt).scalar_one_or_none()
        if not owner_role:
            print("!!! ERROR: 'Owner' role not found in database. Please run Role seeder first.")
            return

        ## Start seeding the tenant owner
        ## Filter on ADMIN_EMAIL, the variable. This used to filter on the
        ## literal string "ADMIN_EMAIL", which can never match any row, so the
        ## existence check always reported "not found" and inserted a new
        ## owner user on every single run.
        ##
        ## `.first()` rather than `scalar_one_or_none()`: this is an existence
        ## check, so one row is all it needs. scalar_one_or_none() additionally
        ## asserts uniqueness, which turned databases already carrying the
        ## duplicates this bug created into a hard failure -- the seeder could
        ## never recover from its own past. Duplicates are reported instead.
        user_stmt = select(User).filter_by(email=ADMIN_EMAIL, is_deleted=False)
        existing_admins = db_session.execute(user_stmt).scalars().all()

        if len(existing_admins) > 1:
            print(
                f"!!! WARNING: {len(existing_admins)} active users share the "
                f"owner email {ADMIN_EMAIL}. Only the first is kept; the "
                f"rest are leftovers from a previous seeding bug. Remove them: "
                f"DELETE FROM users WHERE email = '{ADMIN_EMAIL}' AND id > "
                f"{existing_admins[0].id};"
            )

        existing_admin = existing_admins[0] if existing_admins else None

        if not existing_admin:
            ## Create the owner user
            hashed_password = bcrypt.generate_password_hash(ADMIN_PASSWORD, 12).decode("utf-8")
            owner_user = User(
                first_name="Owner",
                last_name="Admin",
                email=ADMIN_EMAIL,
                password=hashed_password,
                role_id=owner_role.id,
                is_email_verified=True,
                is_active=True,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc)
            )
            db_session.add(owner_user)
            db_session.commit()
            print("--- Owner user created successfully. ---")
        else:
            print(f"Owner ({ADMIN_EMAIL}) already exists. Skipping...")
    except Exception as e:
        db_session.rollback()
        ## Raise rather than print-and-return, consistent with the other
        ## seeders. A silently skipped owner is an app nobody can log into,
        ## and that should stop the run rather than look like success.
        print(f"!!! Owner seeder FAILED: "
              f"{str(e).encode('ascii', 'replace').decode('ascii')[:300]}")
        raise
    finally:
        db_session.remove()


if __name__ == "__main__":
    seed_tenant_owner()
