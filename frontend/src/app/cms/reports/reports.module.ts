import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ReportsRoutingModule } from './reports-routing.module';
import { ReportScreenComponent } from './report-screen.component';
import { SharedModule } from '../../shared/shared.module';

@NgModule({
  declarations: [
    ReportScreenComponent
  ],
  imports: [
    CommonModule,
    ReportsRoutingModule,
    SharedModule
  ]
})
export class ReportsModule { }
