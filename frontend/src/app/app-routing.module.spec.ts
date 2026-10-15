import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CanMatchFn, Router, Routes, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { AppConfig } from './core/config/config';
import { routes as appRoutes } from './app-routing.module';
import { platformHostMatch, tenantHostMatch } from './core/platform-host.guard';
import { PageNotFoundComponent } from './shared/page-not-found/page-not-found.component';

/**
 * Covers the host-split root table.
 *
 * Two surfaces share one bundle and the host tells them apart: `admin.*` is the
 * platform console, every other host is the tenant app. Each surface is a
 * component-less shell carrying a `canMatch` guard, with its own children.
 *
 * The checks come in two kinds:
 *
 *   * behavioural -- the shell pattern itself. The regression it exists for is
 *     that **a route with `redirectTo` never runs its `canMatch` guards**
 *     (`processSegmentAgainstRoute` branches to
 *     `expandSegmentAgainstRouteUsingRedirect` before `matchWithChecks` runs),
 *     so a *gated redirect* at the top level fires on every host. The first
 *     surface's redirect therefore points somewhere unreachable, and following
 *     it is what the failure looks like.
 *   * structural -- the real table never gates a redirect, and each shell
 *     holds exactly the routes of its own surface.
 *
 * These use stub feature routes rather than the real `cms` table. The real one
 * lazily loads modules full of Material components and services needing
 * HttpClient, and rendering an actual dashboard would test the dashboard.
 *
 * The host itself cannot be varied from Karma (the page is served from
 * `localhost`), so the hostname rule is covered directly in
 * `core/platform-host.spec.ts`.
 */
@Component({ selector: 'app-stub', standalone: true, template: 'stub' })
class StubDashboardComponent { }

@Component({ selector: 'app-stub-notfound', standalone: true, template: '404' })
class StubNotFoundComponent { }

/** The guard a surface the visitor is *not* on would carry. */
const otherHost: CanMatchFn = () => false;
/** The guard a surface the visitor *is* on carries. */
const thisHost: CanMatchFn = () => true;

describe('app routing', () => {

  /**
   * Mirrors the real shape: two component-less shells, the first on a guard
   * that does not pass, its child a redirect to a URL that has no route.
   *
   * The nesting matters. A flat first route with `redirectTo` and `canMatch`
   * is exactly the broken shape -- the guard is skipped and the redirect
   * fires -- so this stub reproduces it and asserts the shell avoids it.
   */
  function stubRoutes(): Routes {
    return [
      {
        path: '',
        canMatch: [otherHost],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'console/dashboard' }
        ]
      },
      {
        path: '',
        canMatch: [thisHost],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'cms/dashboard' },
          {
            path: 'cms',
            children: [{ path: 'dashboard', component: StubDashboardComponent }]
          }
        ]
      },
      { path: '**', component: StubNotFoundComponent }
    ];
  }

  /** First-level path of the activated route, e.g. '' (a shell) or '**'. */
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

  it('redirects / to the surface that is open, not the other one', async () => {
    // Start elsewhere first: re-navigating to the URL the router already holds
    // is a same-URL navigation, which the router ignores -- the redirect would
    // never run and the assertion would pass vacuously.
    const harness = await createHarness();
    await harness.navigateByUrl('/cms/dashboard');
    await harness.navigateByUrl('/');
    await settle();

    expect(TestBed.inject(Router).url).toBe('/cms/dashboard');
  });

  it('does not follow a redirect belonging to the surface that did not match', async () => {
    // THE regression. The first shell's guard does not pass, so its child
    // redirect must never fire; if it did, the visitor would land on a URL
    // with no route behind it and get a 404.
    const harness = await createHarness();
    await harness.navigateByUrl('/cms/dashboard');
    await harness.navigateByUrl('/');
    await settle();

    expect(TestBed.inject(Router).url).not.toBe('/console/dashboard');
    expect(TestBed.inject(Router).url).toBe('/cms/dashboard');
  });

  it('matches the shell child route', async () => {
    const harness = await createHarness();
    await settle();
    await harness.navigateByUrl('/cms/dashboard');
    await settle();

    expect(matchedRootPath()).toBe('');
    expect(TestBed.inject(Router).url).toBe('/cms/dashboard');
  });

  it('still 404s a URL under the surface that has no such screen', async () => {
    const harness = await createHarness();
    await harness.navigateByUrl('/cms/does-not-exist');

    // `**` matches any URL while leaving it in the address bar, so this
    // asserts on the matched route rather than on router.url.
    expect(matchedRootPath()).toBe('**');
  });

  // ---- the constraint the shells exist to satisfy -----------------------

  it('a canMatch on a redirect route is ignored, which is why shells gate', async () => {
    // Angular runs canMatch in matchSegmentAgainstRoute, which a route with
    // `redirectTo` bypasses entirely -- processSegmentAgainstRoute branches
    // straight into expandSegmentAgainstRouteUsingRedirect. This
    // characterisation test pins that behaviour so the component-less shells
    // are not later "simplified" back into a gated redirect, which compiles
    // and reads correctly while redirecting on every host.
    TestBed.configureTestingModule({
      providers: [provideRouter([
        {
          path: '',
          pathMatch: 'full',
          canMatch: [() => false],
          redirectTo: 'console/dashboard'
        },
        { path: 'console/dashboard', component: StubDashboardComponent },
        { path: 'tenant/home', component: StubDashboardComponent },
        { path: '**', component: StubNotFoundComponent }
      ])]
    });

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/tenant/home');
    await harness.navigateByUrl('/');
    await settle();

    // The guard returned false and the redirect fired anyway.
    expect(TestBed.inject(Router).url).toBe('/console/dashboard');
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

  it('no real redirect is gated by canMatch', () => {
    // The router skips canMatch on a route that has `redirectTo`, so such a
    // gate compiles, reads correctly, and does nothing -- while its redirect
    // fires on every host. Every gate in this table must therefore sit on a
    // route that actually has something to gate.
    const gatedRedirects = appRoutes.filter(r => r.redirectTo && r.canMatch?.length);

    expect(gatedRedirects).toEqual([]);
  });

  it('gates exactly the two host shells, and only they', () => {
    const gated = appRoutes.filter(r => r.canMatch?.length);

    expect(gated.map(r => r.path)).toEqual(['', '']);
    expect(gated[0]?.canMatch).toEqual([platformHostMatch]);
    expect(gated[1]?.canMatch).toEqual([tenantHostMatch]);
    expect(gated.every(r => r.children?.length)).toBe(true);
  });

  /** Children of the shell for a given surface, for the checks below. */
  function shellChildren(guard: CanMatchFn): Routes {
    return appRoutes.find(r => r.canMatch?.includes(guard))?.children ?? [];
  }

  it('holds every console route in the console shell', () => {
    const lazy = shellChildren(platformHostMatch)
      .filter(r => typeof r.loadChildren === 'function')
      .map(r => r.path);

    expect(lazy).toEqual(['platform']);
  });

  it('holds every workspace route in the workspace shell', () => {
    const lazy = shellChildren(tenantHostMatch)
      .filter(r => typeof r.loadChildren === 'function')
      .map(r => r.path);

    expect(lazy).toEqual(['auth', 'cms']);
  });

  it('redirects the console host only into the console', () => {
    const redirects = shellChildren(platformHostMatch).filter(r => r.redirectTo);

    expect(redirects.map(r => r.path)).toEqual(['', 'auth/login', 'auth']);
    // Resolved against the shell (whose path is empty), so they stay inside
    // the console rather than sending the operator into the tenant app.
    expect(redirects.every(r => r.redirectTo!.startsWith('platform/'))).toBe(true);
  });

  it('redirects the workspace host only to its own dashboard', () => {
    const redirects = shellChildren(tenantHostMatch).filter(r => r.redirectTo);

    expect(redirects.map(r => r.path)).toEqual(['']);
    expect(redirects[0]?.redirectTo).toBe('cms/dashboard');
  });

  it('the real table still 404s unmatched URLs', () => {
    expect(appRoutes.find(r => r.path === '**')?.component)
      .toBe(PageNotFoundComponent);
  });
});
