import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PageNotFoundComponent } from './shared/page-not-found/page-not-found.component';
import { UnauthorizedAccessComponent } from './shared/unauthorized-access/unauthorized-access.component';
import { platformHostMatch, tenantHostMatch } from './core/platform-host.guard';

/**
 * The route table is a static array, but it is no longer a single product's.
 *
 * Two surfaces share this bundle and must never be reachable from each other:
 * the tenant app and the platform (super admin) console. Which one a visitor
 * gets is decided by the host -- `admin.localhost:4200` is the console, every
 * other host is a workspace -- so each surface's routes carry a `canMatch`
 * guard keyed on the hostname.
 *
 * `canMatch`, not `canActivate`, is deliberate: it is consulted before a lazy
 * module is fetched, so the console's chunks are never downloaded on a tenant
 * host and the tenant's never are on the console host. It is also what lets
 * `/auth/login` mean two different things, since the path alone cannot tell
 * the two surfaces apart.
 *
 * The guards are exhaustive -- one host guard always passes -- so navigation
 * always resolves to exactly one surface instead of falling through to the
 * 404 page.
 */
export const routes: Routes = [
  // ---- Platform console: only on the admin host. ----
  {
    path: '',
    pathMatch: 'full',
    canMatch: [platformHostMatch],
    redirectTo: 'platform/dashboard'
  },
  {
    path: 'auth',
    pathMatch: 'full',
    canMatch: [platformHostMatch],
    redirectTo: 'platform/login'
  },
  {
    // The URL the operator reaches for first on the console host.
    path: 'auth/login',
    canMatch: [platformHostMatch],
    redirectTo: 'platform/login'
  },
  {
    path: 'platform',
    canMatch: [platformHostMatch],
    loadChildren: () => import('./platform/platform.module').then(a => a.PlatformModule)
  },

  // ---- Tenant app: every other host. ----
  {
    path: '',
    pathMatch: 'full',
    canMatch: [tenantHostMatch],
    redirectTo: 'cms/dashboard'
  },
  {
    path: 'auth',
    canMatch: [tenantHostMatch],
    loadChildren: () => import('./auth/auth.module').then(a => a.AuthModule)
  },
  {
    path: 'cms',
    canMatch: [tenantHostMatch],
    loadChildren: () => import('./cms/cms.module').then(a => a.CmsModule)
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
