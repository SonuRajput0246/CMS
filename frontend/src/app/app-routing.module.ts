import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PageNotFoundComponent } from './shared/page-not-found/page-not-found.component';
import { UnauthorizedAccessComponent } from './shared/unauthorized-access/unauthorized-access.component';

/**
 * The route table is a plain static array evaluated at module load.
 *
 * There is no instance gate here, and deliberately so. The table used to carry
 * a `canMatch` per product so only the active one could match, which existed
 * solely because one build served two products. With one product the gate had
 * nothing to decide, and it was not free either: `canMatch` defers the decision
 * to navigation time, because the type was resolved from the backend during
 * bootstrap and is not knowable while NgModule metadata is being read.
 *
 * That constraint is also why the bare `/` route used to be a component rather
 * than a `redirectTo` -- an instance-aware redirect has no static string to
 * redirect to. The path is a literal now, so the redirect is declared as one
 * and the component that existed only to compute it is gone.
 */
export const routes: Routes = [
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
