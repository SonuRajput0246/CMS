"""Where a tenant is reachable, derived from the deployment's base URL.

`_tenant_domain` used to live as a private helper on
`TenantManagementService`, where it answered one question: what host does
the platform console print for a hotel's URL? The invitation flow needs the
same answer to build the accept link emailed to a new administrator, and a
second implementation of the rule would be a second chance to disagree with
`resolution.py` -- the code that reads a `Host` header back into a slug.

So the rule moved here, verbatim, and both callers import it. It is the exact
inverse of what `resolution.py` does when it reads a `Host` header -- there,
label zero becomes the slug:

    http://localhost:4200         -> localhost:4200
    https://example.com           -> example.com
    https://console.example.com   -> example.com

So the rule mirrors that resolver rather than inventing a second one:

  * a host with three or more labels has the deployment's own label in
    front, which `resolution.py` reads as the tenant slug and which is
    therefore exactly what must be dropped here;
  * one or two labels is the bare domain (`example.com`) or development
    (`localhost`), where the tenant URL really is `demo.localhost:4200` or
    `demo.example.com`, so the whole host is kept.
"""
import ipaddress
from urllib.parse import urlsplit


def tenant_domain(public_base_url: str) -> str:
    """The host every tenant's subdomain hangs off.

    `PUBLIC_BASE_URL` names the deployment; this names the *domain beneath it*,
    by dropping the deployment's own first label.

    One variable to configure instead of two: a second one would be a second
    chance for the console to print a host no tenant is actually served on.
    """
    parsed = urlsplit(public_base_url)
    hostname = (parsed.hostname or "").lower()
    if not hostname:
        return ""

    ## An IP literal has no labels to spare -- `5.6.7.8` minus its first label
    ## would be `6.7.8`, a host nobody could reach.
    try:
        ipaddress.ip_address(hostname)
        domain = hostname
    except ValueError:
        labels = hostname.split(".")
        domain = hostname if len(labels) <= 2 else ".".join(labels[1:])

    return f"{domain}:{parsed.port}" if parsed.port else domain


def tenant_origin(public_base_url: str, slug: str) -> str:
    """`scheme://<slug>.<tenant_domain>`, e.g. `http://demo1.localhost:4200`.

    Empty string when the deployment has no usable base URL -- the caller
    decides whether that is worth failing over, rather than this helper
    inventing a scheme or a host.
    """
    domain = tenant_domain(public_base_url)
    if not domain:
        return ""

    ## The scheme is taken from PUBLIC_BASE_URL, never defaulted separately:
    ## a console served over https must not email http links.
    scheme = urlsplit(public_base_url).scheme or "http"
    return f"{scheme}://{slug}.{domain}"


def tenant_accept_url(public_base_url: str, slug: str, token: str) -> str:
    """The single-use invitation link, for the email body.

    Path fixed here (not at the call site) so the backend, the fallback copy
    and the Angular accept route cannot drift apart on spelling. It lives
    under `auth/` because every unauthenticated tenant flow does -- the auth
    module owns the surface, this only names its address.
    """
    return f"{tenant_origin(public_base_url, slug)}/auth/accept-invitation?token={token}"
