import { AuthGuard } from '../core/auth.guard';
// import { RouteGuardService } from '../services/route-guard.service';

export const childRoutes = [
    {
        path: 'dashboard',
        loadChildren: () =>
            import('./dashboard/dashboard.module').then(d => d.DashboardModule),
        data: { menuId: 1 },
        canActivate: [AuthGuard]
    },
    {
        path: "profile",
        loadChildren: () =>
            import('./profile/profile.module').then(c => c.ProfileModule),
        data: { menuId: 1 },
        canActivate: [AuthGuard]
    },
    {
        path: "settings",
        loadChildren: () =>
            import('./settings-security/settings-security.module').then(c => c.SettingsSecurityModule),
        data: { menuId: 1 },
        canActivate: [AuthGuard]
    },
    {
        path: "users",
        loadChildren: () =>
            import('./user/user.module').then(a => a.UserModule),
        data: { menuId: 2 },
        canActivate: [AuthGuard]
    },
    {
        path: "inventory",
        loadChildren: () =>
            import('./inventory/inventory.module').then(a => a.InventoryModule),
        data: { menuId: 3 },
        canActivate: [AuthGuard]
    },
    {
        path: "roles",
        loadChildren: () =>
            import('./role/role.module').then(a => a.RoleModule),
        data: { menuId: 8 },
        canActivate: [AuthGuard]
    },
    {
        path: "templates",
        loadChildren: () =>
            import('./templates/templates.module').then(a => a.TemplatesModule),
        data: { menuId: 10 },
        canActivate: [AuthGuard]
    },
    // {
    //     path: '404',
    //     component: PageNotFoundComponent
    // },
    // {
    //     path: 'unauthorized-access',
    //     component: UnautherizedPageComponent
    // }
];