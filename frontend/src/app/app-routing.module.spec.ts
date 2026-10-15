import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, Routes, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { AppConfig } from './core/config/config';
import { routes as appRoutes } from './app-routing.module';
import { platformHostMatch, tenantHostMatch } from './core/platform-host.guard';
import { PageNotFoundComponent } from './shared/page-not-found/page-not-found.component';

/**
 * Covers the host-split root table.
 *
 * Two surfaces now share one bundle, and the host is what tells them apart:
 * `admin.*` is the platform console, every other host is the tenant app. That
 * split is expressed as a `canMatch` on each surface's routes, so the checks
 * below come in two kinds:
 *
 *   * behavioural -- that a `canMatch` redirect resolves and an unknown URL
 *     under a surface still 404s. These use a stub table, because the real one
 *     lazily loads modules full of Material components and services needing
 *     HttpClient; rendering a real dashboard would test the dashboard.
 *   * structural -- that the real table is gated the way the split requires:
 *     every redirect carries a host gate, and each surface's routes carry the
 *     matching one.
 *
 * The host each guard reads cannot be varied from Karma (the page is served
 * from `localhost`), so the hostname logic itself is covered directly in
 * `core/platform-host.spec.ts` and only the wiring is asserted here.
 */
@Component({ selector: 'app-stub', standalone: true, template: 'stub' })
class StubDashboardComponent { }

@Component({ selector: 'app-stub-notfound', standalone: true, template: '404' })
class StubNotFoundComponent { }

describe('app routing', () => {

  /** Stands in for one surface's route tree, gated exactly like the real one. */
  function stubRoutes(): Routes {
    return [
      {
        path: '',
        pathMatch: 'full',
        canMatch: [tenantHostMatch],
        redirectTo: 'cms/dashboard'
      },
      {
        path: 'cms',
        canMatch: [tenantHostMatch],
        children: [{ path: 'dashboard', component: StubDashboardComponent }]
      },
      { path: '**', component: StubNotFoundComponent }
    ];
  }

  /** First-level path of the activated route, e.g. 'cms' or '**'. */
  function matchedRootPath(): string | undefined {
    return TestBed.inject(Router).routerState.snapshot.root.firstChild
      ?.routeConfig?.path;
  }

  function settle(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  async function createHarness(): Promise<RouterTestingHarness> {
    const config = new AppConfig();
    config.set('BASE_URL', 'http://localhost:5000');

    TestBed.configureTestingModule({
      providers: [provideRouter(stubRoutes()), { provide: AppConfig, useValue: config }]
    });

    return RouterTestingHarness.create();
  }

  // ---- root redirect ----------------------------------------------------

  it('redirects / to /cms/dashboard', async () => {
    const harness = await createHarness();
    // Start elsewhere first: re-navigating to the URL the router already holds
    // is a same-URL navigation, which the router ignores -- the redirect would
    // never run and the assertion would pass vacuously.
    await harness.navigateByUrl('/cms/dashboard');
    await harness.navigateByUrl('/');
    await settle();

    expect(TestBed.inject(Router).url).toBe('/cms/dashboard');
  });

  it('matches the surface route', async () => {
    const harness = await createHarness();
    await settle();
    await harness.navigateByUrl('/cms/dashboard');
    await settle();

    expect(matchedRootPath()).toBe('cms');
  });

  it('still 404s a URL under the surface that has no such screen', async () => {
    const harness = await createHarness();
    await harness.navigateByUrl('/cms/does-not-exist');

    // `**` matches any URL while leaving it in the address bar, so this
    // asserts on the matched route rather than on router.url.
    expect(matchedRootPath()).toBe('**');
  });

  // ---- structural checks against the real table ------------------------

  it('the real table passes router validation', () => {
    TestBed.configureTestingModule({ providers: [provideRouter(appRoutes)] });

    expect(() => TestBed.inject(Router).config).not.toThrow();
  });

  it('no real route lacks component, redirectTo, children or loadChildren', () => {
    // NG04014's exact precondition. A route once carried only a guard, which
    // compiled cleanly and then threw the moment the router validated its
    // config at bootstrap.
    const invalid = appRoutes.filter(
      r => r.redirectTo === undefined
        && !r.component
        && !r.loadComponent
        && !r.children
        && !r.loadChildren
    );

    expect(invalid).toEqual([]);
  });

  it('every real redirect is host-gated', () => {
    // A redirect without a host gate would fire on both surfaces, so `/` on
    // the console host would send the operator to the tenant dashboard. This
    // replaces the old "no route is both redirected and guarded" rule: a
    // guard on a redirect is now exactly what makes the split work.
    const ungated = appRoutes.filter(r => r.redirectTo && !r.canMatch?.length);

    expect(ungated).toEqual([]);
  });

  it('gates the console routes to the platform host only', () => {
    const platformGated = appRoutes
      .filter(r => r.canMatch?.includes(platformHostMatch))
      .map(r => r.path)
      .sort();

    expect(platformGated).toEqual(['', 'auth', 'auth/login', 'platform']);
  });

  it('gates the tenant routes to every non-platform host', () => {
    const tenantGated = appRoutes
      .filter(r => r.canMatch?.includes(tenantHostMatch))
      .map(r => r.path)
      .sort();

    expect(tenantGated).toEqual(['', 'auth', 'cms']);
  });

  it('the redirected host routes point at the other surface', () => {
    // These two are the "right address, wrong host" bridges: the operator's
    // `/auth/login` on the console host, and the tenant's `/` on a tenant host.
    const consoleLogin = appRoutes.find(
      r => r.path === 'auth/login' && r.canMatch?.includes(platformHostMatch)
    );
    expect(consoleLogin?.redirectTo).toBe('platform/login');

    const tenantHome = appRoutes.find(
      r => r.path === '' && r.canMatch?.includes(tenantHostMatch)
    );
    expect(tenantHome?.redirectTo).toBe('cms/dashboard');
  });

  it('the real table lazy-loads exactly the console and the tenant app', () => {
    const lazyRoots = appRoutes
      .filter(r => typeof r.loadChildren === 'function')
      .map(r => r.path);

    expect(lazyRoots).toEqual(['platform', 'auth', 'cms']);
  });

  it('the real table still 404s unmatched URLs', () => {
    expect(appRoutes.find(r => r.path === '**')?.component)
      .toBe(PageNotFoundComponent);
  });

});
