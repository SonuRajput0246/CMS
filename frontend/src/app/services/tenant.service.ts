import { Injectable } from '@angular/core';

/**
 * Resolves the workspace (tenant) from the browser URL.
 *
 * A tenant is reached at its own subdomain -- `demo1.localhost:4200` -- so the
 * first DNS label is the tenant slug. The backend is told which tenant a
 * request belongs to through the `X-Tenant-Slug` header, set by the HTTP
 * interceptor from this value.
 *
 * In production, the same rule applies (`demo1.example.com`). Bare domains
 * (`localhost:4200`, `www.example.com`) have no tenant slug, which is correct.
 */
@Injectable({ providedIn: 'root' })
export class TenantService {

  /**
   * Labels that are infrastructure, not a workspace. Mirrors the backend's
   * `_RESERVED_LABELS` (backend/src/api/tenancy/resolution.py): `admin` and
   * `superadmin` name the platform console, so a request arriving at one of
   * them is not a tenant request and must send no slug.
   */
  private static readonly RESERVED = [
    'localhost',
    'www',
    'api',
    'app',
    'admin',
    'superadmin',
    'sa',
    'panel',
  ];

  /** The current tenant slug, or null when the URL names no tenant. */
  readonly slug: string | null;

  constructor() {
    this.slug = TenantService.readSlug(
      (typeof window !== 'undefined' && window.location)
        ? window.location.hostname
        : ''
    );
  }

  private static readSlug(hostname: string): string | null {
    const host = (hostname || '').toLowerCase().trim();
    if (!host) {
      return null;
    }

    // IP literals (IPv4 "127.0.0.1", IPv6 "[::1]") are infrastructure.
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':') || host.includes('[')) {
      return null;
    }

    const labels = host.split('.');
    if (labels.length < 2) {
      return null;
    }

    // Two labels is a subdomain only in development (*.localhost).
    if (labels.length === 2 && labels[1] !== 'localhost') {
      return null;
    }

    const candidate = labels[0];
    return TenantService.RESERVED.includes(candidate) ? null : candidate;
  }
}
