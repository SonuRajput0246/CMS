import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from '../core/auth.guard';
import { LayoutComponent } from './layout/layout.component';
import { childRoutes } from './child-routes';

const routes: Routes = [
  // Full-bleed terminal screens: no sidebar, no breadcrumb, own 100vh shell.
  {
    path: 'pos',
    loadChildren: () => import('./pos/pos.module').then(m => m.PosModule),
    data: { menuId: 7 },
    canActivate: [AuthGuard]
  },
  {
    path: 'kds',
    loadChildren: () => import('./kds/kds.module').then(m => m.KdsModule),
    data: { menuId: 6 },
    canActivate: [AuthGuard]
  },
  {
    path: '',
    component: LayoutComponent,
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      ...childRoutes
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CmsRoutingModule { }
