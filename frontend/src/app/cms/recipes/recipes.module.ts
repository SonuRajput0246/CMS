import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { RecipesRoutingModule } from './recipes-routing.module';
import { RecipeListComponent } from './recipe-list.component';
import { ManageRecipeComponent } from './manage-recipe/manage-recipe.component';
import { ManageRecipeCategoryComponent } from './manage-recipe-category/manage-recipe-category.component';
import { SharedModule } from '../../shared/shared.module';


@NgModule({
  declarations: [
    RecipeListComponent,
    ManageRecipeComponent,
    ManageRecipeCategoryComponent
  ],
  imports: [
    CommonModule,
    RecipesRoutingModule,
    SharedModule
  ]
})
export class RecipesModule { }
