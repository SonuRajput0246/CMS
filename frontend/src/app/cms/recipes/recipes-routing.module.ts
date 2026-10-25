import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RecipeListComponent } from './recipe-list.component';

const routes: Routes = [
  {
    path: '',
    component: RecipeListComponent
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
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class RecipesRoutingModule { }
