import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, Routes, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { AppConfig } from './core/config/config';
import { routes as appRoutes } from './app-routing.module';
import { PageNotFoundComponent } from './shared/page-not-found/page-not-found.component';

/**
 * Covers the root redirect and the shape of the exported route table.
 *
 * There is no instance gate to test any more. The table used to carry a
 * `canMatch` per product so only the active one could match; with one product
 * there is nothing to gate, and `redirectTo` replaced the redirect component
 * because the target path is a literal again.
 *
 * The behavioural tests use stub feature routes rather than the real `cms`
 * table. The real one lazily loads modules full of Material components and
 * services that need HttpClient, and rendering an actual dashboard would test
 * the dashboard. What is worth testing is the redirect and the table's shape.
 */
@Component({ selector: 'app-stub', standalone: true, template: 'stub' })
class StubDashboardComponent { }

@Component({ selector: 'app-stub-notfound', standalone: true, template: '404' })
class StubNotFoundComponent { }

describe('app routing', () => {

  /**
   * Mirrors the real shapes: one product route that is a container with
   * children, matching the real `cms` route which is a `loadChildren` module
   * with its own child routes.
   *
   * The nesting matters. A bare leaf route (`path: 'cms'` + `loadComponent`)
   * cannot match `/cms/dashboard` at all -- it consumes only `cms` and leaves
   * `dashboard` unmatched, so it always falls through to `**`. A leaf would
   * make the redirect assertions pass for the wrong reason and would hide a
   * genuinely broken real route.
   */
  function stubRoutes(): Routes {
    return [
      { path: '', pathMatch: 'full', redirectTo: 'cms/dashboard' },
      {
        path: 'cms',
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

  it('redirects / to /cms/dashboard for an unknown top-level path too', async () => {
    // Not a 404: the bare path is the app's home, so anything that does not
    // match a real route first lands here and falls to the dashboard.
    const harness = await createHarness();
    await harness.navigateByUrl('/cms/dashboard');
    await harness.navigateByUrl('/');
    await settle();

    expect(matchedRootPath()).toBe('cms');
  });

  // ---- the cms route is reachable ---------------------------------------

  it('matches the cms route without any guard', async () => {
    const harness = await createHarness();
    await settle();
    await harness.navigateByUrl('/cms/dashboard');
    await settle();

    expect(matchedRootPath()).toBe('cms');
  });

  it('still 404s a URL under the product that has no such screen', async () => {
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
    // NG04014's exact precondition. This is the regression: the root route
    // once carried only a canActivate, which compiled cleanly and then threw
    // the moment the router validated its config at bootstrap.
    const invalid = appRoutes.filter(
      r => r.redirectTo === undefined
        && !r.component
        && !r.loadComponent
        && !r.children
        && !r.loadChildren
    );

    expect(invalid).toEqual([]);
  });

  it('no real route is both redirected and guarded', () => {
    const conflicted = appRoutes.filter(
      r => r.redirectTo && (r.canActivate?.length || r.canMatch?.length)
    );

    expect(conflicted).toEqual([]);
  });

  it('the real root route redirects rather than rendering a component', () => {
    // A component here would be a leftover of the instance-aware redirect,
    // which needed one because redirectTo takes a static string and the
    // target used to depend on the resolved product.
    const root = appRoutes.find(r => r.path === '');
    expect(root?.redirectTo).toBe('cms/dashboard');
    expect(root?.component).toBeUndefined();
  });

  it('the real cms route is not instance-gated', () => {
    // There is one product, so a canMatch here would have nothing to decide.
    expect(appRoutes.find(r => r.path === 'cms')?.canMatch).toBeUndefined();
    expect(appRoutes.find(r => r.path === 'cms')?.loadChildren).toBeDefined();
  });

  it('the real table has exactly one product route', () => {
    // Guards against a second product's route being pasted back in without its
    // lazy module, which would compile and then fail at navigation time.
    const lazyRoots = appRoutes
      .filter(r => typeof r.loadChildren === 'function')
      .map(r => r.path);

    expect(lazyRoots).toEqual(['auth', 'cms']);
  });

  it('the real table still 404s unmatched URLs', () => {
    expect(appRoutes.find(r => r.path === '**')?.component)
      .toBe(PageNotFoundComponent);
  });

});
