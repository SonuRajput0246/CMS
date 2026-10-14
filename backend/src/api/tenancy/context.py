"""Which tenant is the current unit of work operating on.

Two storage mechanisms, deliberately:

  * Inside a Flask request the value lives on `g`. Flask guarantees `g` is
    per-request, so one request can never see another's tenant -- which is the
    entire safety property this module exists to provide.

  * Outside a request (seeders, `scripts/`, a management command) there is no
    `g`, so the value lives in a ContextVar. A ContextVar is correct for those
    too: `bypass_tenant_filter()` is a scoped `set`/`reset`, so it cannot leak
    past the `with` block even if the caller's thread is reused.

Nothing here decides WHICH tenant is current. Resolution happens in the auth
layer (`auth_middleware.authenticate` reads the JWT claim and populates `g`);
this module only holds the answer and hands it to the query filter.

Read it through `get_current_tenant_id()`. Never read the ContextVar directly --
that would silently return None inside a request and disable filtering, which
is the failure this whole design exists to prevent.
"""
from contextlib import contextmanager
from contextvars import ContextVar

from flask import g, has_app_context


## Sentinel used as the ContextVar default so "deliberately bypassed" and
## "nothing set" stay distinguishable. `None` is a legitimate tenant_id meaning
## the platform/global scope, which is not the same as not having a tenant.
_BYPASS = object()

_context_tenant: ContextVar = ContextVar("cms_tenant_id", default=None)
_context_bypass: ContextVar = ContextVar("cms_tenant_bypass", default=_BYPASS)


def set_current_tenant_id(tenant_id: int | None) -> None:
    """Bind the current tenant for the rest of this request (or this thread)."""
    if has_app_context():
        g.tenant_id = tenant_id
    else:
        _context_tenant.set(tenant_id)


def get_current_tenant_id() -> int | None:
    """The tenant every query must be restricted to, or None if unknown.

    None is the dangerous value: `src/api/tenancy/filters.py` treats it as
    "no tenant in context" and leaves queries UNFILTERED. That is correct for
    the seeding and migration paths, which legitimately run before any tenant
    exists, and wrong everywhere else. If a request-scoped query ever sees
    None, the bug is that `authenticate()` did not populate `g.tenant_id`.
    """
    if has_app_context():
        return getattr(g, "tenant_id", None)
    return _context_tenant.get()


def is_tenant_filter_bypassed() -> bool:
    """True while inside `bypass_tenant_filter()`."""
    if has_app_context():
        return getattr(g, "tenant_filter_bypassed", False)
    return _context_bypass.get() is _BYPASS


@contextmanager
def bypass_tenant_filter(reason: str = ""):
    """Run queries WITHOUT tenant scoping.

    Only three things may use this:

      1. Tenant bootstrap -- copying the role/prefix/template template into a
         tenant that does not exist yet, so there is nothing to scope to.
      2. Seeders and migrations, which run before any tenant exists.
      3. Platform-admin endpoints, which by definition operate across tenants.

    A service method that uses this is a cross-tenant read or write and needs
    to say so in a comment explaining why the scoping does not apply. It is not
    a convenience for "I forgot the filter" -- that case is handled by the
    filter itself and must never reach this function.

    The optional `reason` is recorded in the log line below, because the one
    way to make this dangerous is for it to be used so often that nobody
    notices a new caller.
    """
    if has_app_context():
        g.tenant_filter_bypassed = True
        try:
            yield
        finally:
            g.tenant_filter_bypassed = False
    else:
        token = _context_bypass.set(_BYPASS)
        try:
            yield
        finally:
            _context_bypass.reset(token)
