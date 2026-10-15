import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PageNotFoundComponent } from './shared/page-not-found/page-not-found.component';
import { UnauthorizedAccessComponent } from './shared/unauthorized-access/unauthorized-access.component';
import { platformHostMatch, tenantHostMatch } from './core/platform-host.guard';

/**
 * The route table, split by host into two surfaces.
 *
 * Two products share this bundle and must never be reachable from each other:
 * the tenant app and the platform (super admin) console. Which one a visitor
 * gets is decided by the host -- `admin.localhost:4200` is the console, every
 * other host is a workspace.
 *
 * Each surface is a single component-less "shell" route carrying a `canMatch`
 * host guard, with everything that surface can do as its children.
 *
 * The shell exists because of a router constraint worth remembering:
 * **`canMatch` is not evaluated on a route that has `redirectTo`.** Matching a
 * redirect stops at `processSegmentAgainstRoute`, which branches to
 * `expandSegmentAgainstRouteUsingRedirect` before `matchWithChecks` (and so
 * before `runCanMatchGuards`) ever runs. A gated redirect therefore redirects
 * on every host, which is precisely the bug this shape avoids: the shell is a
 * normal (non-redirect) route, so its guard does run, and the redirects live
 * one level below where the host has already been decided.
 *
 * `canMatch` rather than `canActivate` is deliberate: it is consulted before a
 * lazy module is fetched, so the console's chunks are never downloaded on a
 * tenant host and the tenant's never are on the console host. It is also what
 * lets `/auth/login` mean two different things, since the path alone cannot
 * tell the two surfaces apart.
 */
export const routes: Routes = [
  // ---- Platform console: only on the console host. ----
  {
    path: '',
    canMatch: [platformHostMatch],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'platform/dashboard'
      },
      {
        // The URL the operator reaches for first on the console host.
        path: 'auth/login',
        redirectTo: 'platform/login'
      },
      {
        path: 'auth',
        pathMatch: 'full',
        redirectTo: 'platform/login'
      },
      {
        path: 'platform',
        loadChildren: () => import('./platform/platform.module').then(a => a.PlatformModule)
      }
    ]
  },

  // ---- Tenant app: every other host. ----
  {
    path: '',
    canMatch: [tenantHostMatch],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'cms/dashboard'
      },
      {
        path: 'auth',
        loadChildren: () => import('./auth/auth.module').then(a => a.AuthModule)
      },
      {
        path: 'cms',
        loadChildren: () => import('./cms/cms.module').then(a => a.CmsModule)
      }
    ]
  },

  {
    // AuthGuard sends denied users here. Declared before `**` because a `**`
    // route matches anything; without this the 403 fell through to the 404
    // page and "no permission" was indistinguishable from "no such page".
    path: 'unauthorized-access',
    component: UnauthorizedAccessComponent
  },
  {
    path: '**',
    component: PageNotFoundComponent
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
