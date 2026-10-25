import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { ReportScreenComponent } from './report-screen.component';

const routes: Routes = [
  { path: '', component: ReportScreenComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ReportsRoutingModule { }
