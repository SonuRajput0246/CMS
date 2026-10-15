import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';

import { SharedModule } from '../shared/shared.module';
import { PlatformRoutingModule } from './platform-routing.module';
import { PlatformLoginComponent } from './login/login.component';
import { PlatformLayoutComponent } from './layout/layout.component';
import { PlatformDashboardComponent } from './dashboard/dashboard.component';
import { TenantListComponent } from './tenants/list/list.component';
import { ManageTenantComponent } from './tenants/manage-tenant/manage-tenant.component';

/**
 * The platform console. SharedModule already re-exports CommonModule,
 * MaterialModule and the reactive forms modules, which is where every widget
 * on these screens comes from.
 */
@NgModule({
  declarations: [
    PlatformLoginComponent,
    PlatformLayoutComponent,
    PlatformDashboardComponent,
    TenantListComponent,
    ManageTenantComponent,
  ],
  imports: [
    CommonModule,
    PlatformRoutingModule,
    SharedModule,
    ReactiveFormsModule,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class PlatformModule {}
