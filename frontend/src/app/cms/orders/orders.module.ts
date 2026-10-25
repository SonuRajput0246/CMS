import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { OrdersRoutingModule } from './orders-routing.module';
import { OrderListComponent } from './order-list/order-list.component';
import { OrderDetailDialogComponent } from './order-list/order-list.component';
import { SharedModule } from '../../shared/shared.module';


@NgModule({
  declarations: [
    OrderListComponent,
    OrderDetailDialogComponent
  ],
  imports: [
    CommonModule,
    OrdersRoutingModule,
    SharedModule
  ]
})
export class OrdersModule { }