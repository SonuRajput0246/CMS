"""Seeds the OWNER account for a DEMO tenant.

Demo path only, and it stays that way. `run_base_seeders` calls this per
tenant, inside that tenant's scope, immediately after `seed_tenant_baseline`
has created the roles. A tenant created from the platform console never gets
this: its first administrator is born when they accept the invitation
(src/api/services/tenant_invitation_service.py), which is exactly why
`provision_tenant` calls `seed_tenant_baseline` and NOT this module.

Credentials come from configuration (`DEMO_TENANT_OWNER_*`, see BaseConfig)
rather than being hardcoded, so a deployment cannot be seeded with a
well-known password by oversight. The account is created active and
email-verified with the password already set -- no invitation, no accept
page -- so a fresh database is signable-into immediately. MFA stays off: it
is opt-in for tenant users, unlike the platform console.

The role is OWNER ("Owner") of this one tenant -- nothing platform-level.

Idempotent on this tenant's email: a second run finds the account, refreshes
nothing and never duplicates the row.

    python -m src.database.seeders.demo_tenant_owner_seeder
"""
from datetime import datetime, timezone

from sqlalchemy import select

from src.api.extensions import bcrypt
from src.api.models.role_model import Role
from src.api.models.user_model import User
from src.config import get_config
from src.database.session import db_session


def seed_demo_tenant_owner():
    """Create the demo Owner for the tenant currently in scope."""
    config = get_config()
    email = (config.DEMO_TENANT_OWNER_EMAIL or "").strip().lower()

    try:
        if not email:
            ## Fail loudly rather than seeding nothing: a demo tenant with no
            ## owner is a demo nobody can sign in to.
            raise RuntimeError("DEMO_TENANT_OWNER_EMAIL is empty; cannot seed.")

        ## Matched on role_code, the stable key (see role_model). Roles were
        ## seeded moments ago by seed_tenant_baseline, so a miss here is an
        ## ordering bug rather than something to work around: a user with no
        ## role has no menu and no permissions, so creating it would only
        ## move the failure to sign-in time.
        role = db_session.execute(
            select(Role).filter_by(role_code="OWNER", is_deleted=False)
        ).scalar_one_or_none()
        if role is None:
            raise RuntimeError(
                "The OWNER role was not seeded for this tenant; cannot seed its "
                "demo owner. Run role_seeder first."
            )

        existing = db_session.execute(
            select(User).filter_by(email=email, is_deleted=False)
        ).scalars().all()

        if len(existing) > 1:
            print(
                f"!!! WARNING: {len(existing)} active users share the demo "
                f"owner email {email} in this tenant; only the first is kept."
            )

        if existing:
            print(f"Demo owner {email} already exists. Skipping...")
            return

        hashed_password = bcrypt.generate_password_hash(
            config.DEMO_TENANT_OWNER_PASSWORD, 12
        ).decode("utf-8")
        now = datetime.now(timezone.utc)
        db_session.add(User(
            first_name=config.DEMO_TENANT_OWNER_FIRST_NAME or "Demo",
            last_name=config.DEMO_TENANT_OWNER_LAST_NAME or "Owner",
            email=email,
            password=hashed_password,
            role_id=role.id,
            ## Verified and active because the account was seeded, not
            ## invited: there is no email click to wait for, and the whole
            ## point is that a fresh database can be used at once.
            is_email_verified=True,
            is_active=True,
            last_password_update_at=now,
            created_at=now,
            updated_at=now,
        ))
        db_session.commit()
        print(f"--- Demo owner {email} created with role {role.role_name}. ---")
    except Exception as e:
        db_session.rollback()
        ## Raise rather than print-and-return, consistent with the other
        ## seeders. A silently skipped owner is a demo nobody can sign into,
        ## and that should stop the run rather than look like success.
        print(f"!!! Demo owner seeder FAILED: "
              f"{str(e).encode('ascii', 'replace').decode('ascii')[:300]}")
        raise
    finally:
        db_session.remove()


if __name__ == "__main__":
    ## Standalone runs need a tenant in scope -- every row this writes carries
    ## a tenant_id. The demo tenant fixture is what run_base_seeders seeds, so
    ## this picks up the same ones rather than inventing a second list.
    from src.api.tenancy.context import tenant_scope
    from src.database.seeders.tenant_seeder import seed_tenants

    for _tenant in seed_tenants():
        print(f">>>>> Seeding demo owner for '{_tenant['slug']}' (id={_tenant['id']})")
        with tenant_scope(_tenant["id"], _tenant["timezone"]):
            seed_demo_tenant_owner()
