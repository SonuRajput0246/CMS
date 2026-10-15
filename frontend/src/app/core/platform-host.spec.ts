import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { isPlatformHost, PLATFORM_HOST_LABELS } from './platform-host';
import { platformHostMatch, tenantHostMatch } from './platform-host.guard';

/**
 * The host rule itself, separate from the routes it gates.
 *
 * `isPlatformHost` takes its hostname rather than reading `window.location`
 * so every case here is exercised by a literal -- Karma serves the suite from
 * `localhost`, and a rule that could only ever be tested in one direction
 * would be no test at all.
 */
describe('isPlatformHost', () => {

  it('recognises the console labels in development and production', () => {
    expect(isPlatformHost('admin.localhost')).toBe(true);
    expect(isPlatformHost('superadmin.localhost')).toBe(true);
    expect(isPlatformHost('admin.example.com')).toBe(true);
    expect(isPlatformHost('admin.tenant.example.com')).toBe(true);
  });

  it('treats a tenant subdomain as a workspace', () => {
    expect(isPlatformHost('demo.localhost')).toBe(false);
    expect(isPlatformHost('demo1.example.com')).toBe(false);
  });

  it('treats the bare and infrastructural hosts as neither', () => {
    expect(isPlatformHost('localhost')).toBe(false);
    expect(isPlatformHost('example.com')).toBe(false);
    expect(isPlatformHost('')).toBe(false);
    expect(isPlatformHost('www.example.com')).toBe(false);
  });

  it('treats IP literals as infrastructure, never the console', () => {
    expect(isPlatformHost('127.0.0.1')).toBe(false);
    expect(isPlatformHost('10.0.0.5')).toBe(false);
    expect(isPlatformHost('[::1]')).toBe(false);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(isPlatformHost('  ADMIN.Localhost ')).toBe(true);
  });

  it('matches a label rather than a substring', () => {
    // `admin-2` is a tenant that merely starts with the word; it must not be
    // mistaken for the console.
    expect(isPlatformHost('admin-2.localhost')).toBe(false);
    expect(isPlatformHost('notadmin.localhost')).toBe(false);
  });

  it('exposes the reserved labels it recognises', () => {
    expect(PLATFORM_HOST_LABELS).toEqual(['admin', 'superadmin']);
  });
});

describe('host match guards', () => {

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('the platform guard follows isPlatformHost for the current host', () => {
    // Karma serves from `localhost`, so this asserts the tenant direction of
    // the pair; the reverse is covered by the isPlatformHost cases above.
    const result = TestBed.runInInjectionContext(() => platformHostMatch({} as any, []));

    expect(result).toBe(isPlatformHost());
  });

  it('the tenant guard is the complement, returning true off the console host', () => {
    const result = TestBed.runInInjectionContext(() => tenantHostMatch({} as any, []));

    // Off the console host the tenant guard passes through; on it, it returns
    // a UrlTree redirect instead (not reachable from this hostname).
    expect(result).toBe(true);
  });

  it('is exhaustive: exactly one guard passes for a given host', () => {
    const platform = TestBed.runInInjectionContext(() => platformHostMatch({} as any, []));
    const tenant = TestBed.runInInjectionContext(() => tenantHostMatch({} as any, []));

    const passes = [platform, tenant].filter(r => r === true).length;
    expect(passes).toBe(1);
  });

  it('is a real Router when it redirects', () => {
    // Guards run inside an injection context; the tenant guard relies on that
    // to reach the Router. Asserting the injector supplies one keeps that
    // assumption from silently breaking.
    expect(TestBed.inject(Router)).toBeTruthy();
  });
});
