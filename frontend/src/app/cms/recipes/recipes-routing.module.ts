import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RecipeListComponent } from './recipe-list.component';
import { ManageRecipeComponent } from './manage-recipe/manage-recipe.component';
import { ManageRecipeCategoryComponent } from './manage-recipe-category/manage-recipe-category.component';

const routes: Routes = [
  {
    path: '',
    component: RecipeListComponent,
    pathMatch: 'full',
    data: { breadcrumb: 'Menu & Recipes' }
  },
  // The seeded menu links to the child routes; both tabs live on one screen.
  {
    path: 'list',
    redirectTo: '',
    pathMatch: 'full'
  },
  {
    path: 'categories',
    redirectTo: '',
    pathMatch: 'full'
  },
  {
    path: 'add-recipe',
    component: ManageRecipeComponent,
    data: { breadcrumb: 'Add Recipe' }
  },
  {
    path: 'update-recipe/:id',
    component: ManageRecipeComponent,
    data: { breadcrumb: 'Edit Recipe' }
  },
  {
    path: 'add-category',
    component: ManageRecipeCategoryComponent,
    data: { breadcrumb: 'Add Category' }
  },
  {
    path: 'update-category/:id',
    component: ManageRecipeCategoryComponent,
    data: { breadcrumb: 'Edit Category' }
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class RecipesRoutingModule { }
