import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { InventoryRoutingModule } from './inventory-routing.module';
import { ListCategoryComponent } from './list-category/list-category.component';
import { ManageCategoryComponent } from './manage-category/manage-category.component';
import { ListInventoryComponent } from './list-inventory/list-inventory.component';
import { ManageInventoryComponent } from './manage-inventory/manage-inventory.component';
import { InventoryDashboardComponent } from './inventory-dashboard/inventory-dashboard.component';
import { SharedModule } from '../../shared/shared.module';


/**
 * Inventory screens: stock levels, categories and units.
 *
 * Every component here talks only to InventoryService and the shared models,
 * with no hotel-specific code, so this module owns its own routing outright.
 *
 * The components are exported as well as declared. Exporting them is what lets
 * another feature mount a screen of its own that reuses them, without pulling
 * in this module's routing -- the menu ids baked into InventoryRoutingModule
 * belong to this feature, and a second mount point must not inherit them.
 */
@NgModule({
  declarations: [
    ListCategoryComponent,
    ManageCategoryComponent,
    ListInventoryComponent,
    ManageInventoryComponent,
    InventoryDashboardComponent
  ],
  imports: [
    CommonModule,
    InventoryRoutingModule,
    SharedModule
  ],
  exports: [
    ListCategoryComponent,
    ManageCategoryComponent,
    ListInventoryComponent,
    ManageInventoryComponent,
    InventoryDashboardComponent
  ]
})
export class InventoryModule { }
