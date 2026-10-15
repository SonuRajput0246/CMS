"""Creates the tenants themselves.

Every other seeder writes rows that belong to a tenant, so this one runs first
and runs with no tenant in context: `tenants` is the one table that is not
itself scoped (`Tenant` extends `BaseModel`, not `BaseTenantModel`), which is
why nothing here is filtered or stamped with a `tenant_id`.

The list below is a dev fixture, in the same spirit as the other seeders' demo
data: a real deployment creates its tenants through the admin flow. It exists so
a fresh database has something to sign in to. `slug` is the login code a user
types as "Company Code", so the two must match exactly.

Idempotent, matched on `slug`, which is unique. Re-running refreshes name,
timezone and currency on an existing tenant without changing its row id, so
every row that already points at that tenant keeps pointing at it.
"""
from sqlalchemy import select

from src.api.models.tenant_model import Tenant
from src.database.session import db_session


## One demo tenant, using the same timezone the single-tenant install used so an
## existing operator's reports do not shift. Add more dicts to seed more; the
## rest of the run fans out over whatever this list returns.
TENANTS = [
    {
        "name": "Demo Cafe",
        "slug": "demo",
        "timezone": "Asia/Kolkata",
        "currency": "INR",
    },
]


def seed_tenants():
    """Create or refresh the tenants above.

    Returns a plain dict per tenant (id, slug, name, timezone, currency) rather
    than the ORM rows: the session is closed before the caller uses them, and
    the caller only needs the id and zone to enter each tenant's scope.
    """
    try:
        for spec in TENANTS:
            slug = spec["slug"].strip().lower()

            tenant = db_session.execute(
                select(Tenant).filter_by(slug=slug, is_deleted=False)
            ).scalars().first()

            if tenant is None:
                tenant = Tenant(
                    name=spec["name"],
                    slug=slug,
                    timezone=spec["timezone"],
                    currency=spec["currency"],
                    is_active=True,
                    is_deleted=False,
                )
                db_session.add(tenant)
                print(f"  Created tenant: {slug} ({spec['name']})")
            else:
                tenant.name = spec["name"]
                tenant.timezone = spec["timezone"]
                tenant.currency = spec["currency"]
                tenant.is_active = True
                print(f"  Updated tenant: {slug} ({spec['name']})")

        db_session.commit()

        ## Read while the session is still open: commit expires the attributes,
        ## so each access here reloads rather than returning a stale value.
        tenants = [
            {
                "id": row.id,
                "slug": row.slug,
                "name": row.name,
                "timezone": row.timezone,
                "currency": row.currency,
            }
            for row in db_session.execute(
                select(Tenant).where(Tenant.slug.in_([s["slug"] for s in TENANTS]))
            ).scalars().all()
        ]

        print("--- Tenants seeded successfully. ---")
        return tenants

    except Exception as exc:
        db_session.rollback()
        print(f"!!! Tenant seeder FAILED: {str(exc)[:300]}")
        raise
    finally:
        db_session.remove()


if __name__ == "__main__":
    seed_tenants()
