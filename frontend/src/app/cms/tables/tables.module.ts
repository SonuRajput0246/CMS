import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TablesRoutingModule } from './tables-routing.module';
import { TableListComponent } from './table-list/table-list.component';
import { ManageTableComponent } from './manage-table/manage-table.component';
import { ManageZoneComponent } from './manage-zone/manage-zone.component';
import { SharedModule } from '../../shared/shared.module';


@NgModule({
  declarations: [
    TableListComponent,
    ManageTableComponent,
    ManageZoneComponent
  ],
  imports: [
    CommonModule,
    TablesRoutingModule,
    SharedModule
  ]
})
export class TablesModule { }