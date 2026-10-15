"""Turning the login code a caller supplies into a tenant.

`tenant_slug` is the only tenant identifier that arrives from the client. It is
never trusted to select rows on its own: it is resolved to exactly one tenant,
and from that point every query is confined to that tenant's id by
`src/api/tenancy/filters.py`. A caller cannot reach another tenant's data by
inventing a slug, because an unknown slug resolves to nothing.

Resolution is also what makes the row-writing default in
`src/database/base_model.py` correct: entering the tenant before an insert is
what stamps the new row with it.
"""
from sqlalchemy import select

from src.api.models.tenant_model import Tenant
from src.api.tenancy.context import set_current_tenant_id


def find_tenant_by_slug(db, slug: str | None) -> Tenant | None:
    """The active tenant whose login code is `slug`, or None.

    None covers three cases the callers deliberately do not distinguish -- a
    missing slug, an unknown slug, and a deactivated tenant. Telling an
    anonymous caller which of those it was would hand back exactly the
    account-enumeration oracle the slug was chosen to avoid.
    """
    if not slug or not slug.strip():
        return None
    tenant = (
        db.execute(select(Tenant).filter_by(slug=slug.strip().lower(), is_deleted=False))
        .scalars()
        .first()
    )
    if tenant is None or not tenant.is_active:
        return None
    return tenant


def enter_tenant(db, slug: str | None) -> Tenant | None:
    """Resolve `slug` and make that tenant current for the rest of the request.

    Returns the tenant, or None if it could not be resolved (see above). The
    caller owns the wording of the failure, because "unknown company code" reads
    differently on the login screen than on a password reset.
    """
    tenant = find_tenant_by_slug(db, slug)
    if tenant is not None:
        set_current_tenant_id(tenant.id)
    return tenant
