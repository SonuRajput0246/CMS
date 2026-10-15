/**
 * Which hostnames serve the platform (super admin) console.
 *
 * The console is a second surface inside the same bundle: it is reached at a
 * reserved subdomain -- `admin.localhost:4200` in development, `admin.example.com`
 * in production -- and is never addressable from a tenant's subdomain. Only the
 * first DNS label is consulted, so both forms behave identically.
 *
 * These labels mirror the backend's reserved list
 * (`backend/src/api/tenancy/resolution.py`). They can never name a tenant, so
 * there is no collision between "a workspace called admin" and "the platform".
 */
export const PLATFORM_HOST_LABELS = ['admin', 'superadmin'];

/** True when `hostname` (defaulting to the current one) names the platform. */
export function isPlatformHost(hostname?: string): boolean {
  const host = (
    hostname ??
    (typeof window !== 'undefined' && window.location ? window.location.hostname : '')
  )
    .toLowerCase()
    .trim();

  if (!host) {
    return false;
  }

  // IP literals (IPv4 "127.0.0.1", IPv6 "[::1]") are infrastructure, never a
  // labelled host, so they can never select the console.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':') || host.includes('[')) {
    return false;
  }

  return PLATFORM_HOST_LABELS.includes(host.split('.')[0]);
}
