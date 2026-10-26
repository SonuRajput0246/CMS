import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { OrdersRoutingModule } from './orders-routing.module';
import { OrderListComponent } from './order-list/order-list.component';
import { OrderDetailPageComponent } from './order-detail/order-detail.component';
import { SharedModule } from '../../shared/shared.module';


@NgModule({
  declarations: [
    OrderListComponent,
    OrderDetailPageComponent
  ],
  imports: [
    CommonModule,
    OrdersRoutingModule,
    SharedModule
  ]
})
export class OrdersModule { }