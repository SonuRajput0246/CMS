import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CustomerListComponent } from './customer-list/customer-list.component';
import { ManageCustomerComponent } from './manage-customer/manage-customer.component';

const routes: Routes = [
  {
    path: '',
    component: CustomerListComponent,
    pathMatch: 'full',
    data: { breadcrumb: 'Customer Management' }
  },
  {
    path: 'add-customer',
    component: ManageCustomerComponent,
    data: { breadcrumb: 'Add Customer' }
  },
  {
    path: 'update-customer/:id',
    component: ManageCustomerComponent,
    data: { breadcrumb: 'Edit Customer' }
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CustomersRoutingModule { }
