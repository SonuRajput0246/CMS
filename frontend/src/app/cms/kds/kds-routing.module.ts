import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { KdsScreenComponent } from './kds-screen/kds-screen.component';

const routes: Routes = [
  {
    path: '',
    component: KdsScreenComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class KdsRoutingModule { }
