import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { CustomersRoutingModule } from './customers-routing.module';
import { CustomerListComponent } from './customer-list/customer-list.component';
import { CustomerFormDialogComponent } from './customer-list/customer-list.component';
import { CustomerRedeemDialogComponent } from './customer-list/customer-list.component';
import { SharedModule } from '../../shared/shared.module';


@NgModule({
  declarations: [
    CustomerListComponent,
    CustomerFormDialogComponent,
    CustomerRedeemDialogComponent
  ],
  imports: [
    CommonModule,
    CustomersRoutingModule,
    SharedModule
  ]
})
export class CustomersModule { }