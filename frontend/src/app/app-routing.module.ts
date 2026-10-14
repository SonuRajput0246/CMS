import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PageNotFoundComponent } from './shared/page-not-found/page-not-found.component';
import { UnauthorizedAccessComponent } from './shared/unauthorized-access/unauthorized-access.component';
import { APP_PREFIX } from './core/config/app-paths';

/**
 * The route table is a plain static array evaluated at module load.
 *
 * There is no instance gate here, and deliberately so. The table used to hold
 * a `canMatch` per product so only the active one could match, which existed
 * solely because one codebase served two products. With a single product the
 * gate had nothing to decide, and it was not free: `canMatch` forces the
 * decision to wait until navigation time, because the instance type was
 * resolved from the backend during bootstrap and is not knowable while
 * NgModule metadata is being read. Dropping it lets the routes be static, which
 * is what they now are.
 *
 * That earlier constraint is why the bare `/` route used to be a component
 * rather than a `redirectTo`: `redirectTo` takes a static string, and an
 * instance-aware redirect has none. With the path a constant it is a string,
 * so the redirect is declared as one and `InstanceHomeRedirectComponent` is
 * gone with it.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: `${APP_PREFIX}/dashboard`
  },
  {
    path: 'auth',
    loadChildren: () => import('./auth/auth.module').then(a => a.AuthModule)
  },
  {
    path: APP_PREFIX,
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