import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TableListComponent } from './table-list/table-list.component';
import { ManageTableComponent } from './manage-table/manage-table.component';
import { ManageZoneComponent } from './manage-zone/manage-zone.component';

const routes: Routes = [
  {
    path: '',
    component: TableListComponent,
    pathMatch: 'full',
    data: { breadcrumb: 'Table Management' }
  },
  {
    path: 'add-table',
    component: ManageTableComponent,
    data: { breadcrumb: 'Add Table' }
  },
  {
    path: 'update-table/:id',
    component: ManageTableComponent,
    data: { breadcrumb: 'Edit Table' }
  },
  {
    path: 'add-zone',
    component: ManageZoneComponent,
    data: { breadcrumb: 'Add Zone' }
  },
  {
    path: 'update-zone/:id',
    component: ManageZoneComponent,
    data: { breadcrumb: 'Edit Zone' }
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TablesRoutingModule { }
