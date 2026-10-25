import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { KdsRoutingModule } from './kds-routing.module';
import { KdsScreenComponent } from './kds-screen/kds-screen.component';
import { SharedModule } from '../../shared/shared.module';


@NgModule({
  declarations: [
    KdsScreenComponent
  ],
  imports: [
    CommonModule,
    KdsRoutingModule,
    SharedModule
  ]
})
export class KdsModule { }
