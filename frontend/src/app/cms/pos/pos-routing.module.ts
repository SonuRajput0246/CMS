import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PosScreenComponent } from './pos-screen/pos-screen.component';

const routes: Routes = [
  {
    path: '',
    component: PosScreenComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PosRoutingModule { }
