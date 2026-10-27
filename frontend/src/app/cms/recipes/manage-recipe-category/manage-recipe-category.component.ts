import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';

import { INavigationaBar } from '../../../models/ICommon.model';
import { IRecipeCategory } from '../../../models/ICms.model';
import { CmsRecipeService } from '../../../services/cms/recipe.service';
import { CustomSnackbarService } from '../../../shared/custom-snackbar/custom-snackbar.service';

/**
 * Add / edit a menu category on its own route.
 *
 * Deleting a category does not delete its recipes: the recipe -> category FK is
 * emptied, so they move to "Uncategorised" on the POS menu. The counts shown in
 * edit mode come from the server so the operator sees that before they leave.
 */
@Component({
  selector: 'app-manage-recipe-category',
  standalone: false,
  templateUrl: './manage-recipe-category.component.html',
  styleUrls: ['../../tables/table-form-page.scss']
})
export class ManageRecipeCategoryComponent implements OnInit {

  private _recipeService = inject(CmsRecipeService);
  private _snackbar = inject(CustomSnackbarService);
  private _router = inject(Router);
  private _route = inject(ActivatedRoute);
  private _fb = inject(FormBuilder);

  private readonly listRoute = '/cms/recipes';

  navData: INavigationaBar[] = [];
  categoryForm!: FormGroup;

  editingCategory: IRecipeCategory | null = null;
  isEditMode = false;
  isPageLoad = false;
  isSaving = false;

  ngOnInit(): void {
    this.initNavigation();
    this.createForm();

    const categoryId = Number(this._route.snapshot.paramMap.get('id'));
    if (categoryId) {
      this.loadCategory(categoryId);
    }
  }

  private initNavigation(): void {
    this.navData = [
      { displayValue: 'Home', isClickable: true, isDashboard: false, redirectValue: '/cms/dashboard' },
      { displayValue: 'CMS', isClickable: false, isDashboard: false },
      { displayValue: 'Menu & Recipes', isClickable: true, isDashboard: false, redirectValue: this.listRoute },
      {
        displayValue: this._route.snapshot.data['breadcrumb'] || 'Add Category',
        isClickable: false,
        isDashboard: false
      }
    ];
  }

  private createForm(): void {
    this.categoryForm = this._fb.group({
      name: ['', [Validators.required, Validators.maxLength(50)]],
      display_name: ['', [Validators.required, Validators.maxLength(50)]],
      description: ['', Validators.maxLength(1000)],
      display_order: [0, [Validators.min(0)]],
      is_active: [true]
    });
  }

  private loadCategory(categoryId: number): void {
    this.isPageLoad = true;
    this._recipeService.getCategoryById(categoryId)
      .pipe(finalize(() => this.isPageLoad = false))
      .subscribe({
        next: (res) => {
          if (!res?.status || !res.data) {
            this._snackbar.openSnackBar(res?.message || 'Failed to load the category', 'error');
            return;
          }

          const category = res.data as IRecipeCategory;
          this.isEditMode = true;
          this.editingCategory = category;
          this.categoryForm.patchValue({
            name: category.name || '',
            display_name: category.display_name || '',
            description: category.description || '',
            display_order: category.display_order ?? 0,
            is_active: category.is_active ?? true
          });
        },
        error: (err) => {
          const msg = err?.status === 404
            ? 'This category no longer exists.'
            : (err?.error?.message || 'An error occurred while loading the category');
          this._snackbar.openSnackBar(msg, 'error');
        }
      });
  }

  saveCategory(): void {
    /// Trim before validating: the trimmed value is what the server treats as
    /// the unique category name.
    this.trimRequiredFields();

    if (this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    const value = this.categoryForm.value;

    this._recipeService.upsertCategory({
      id: this.editingCategory?.id || 0,
      name: String(value.name ?? '').trim(),
      display_name: String(value.display_name ?? '').trim(),
      description: this.nullIfBlank(value.description),
      display_order: value.display_order || 0,
      is_active: !!value.is_active,
      is_deleted: false
    })
      .pipe(finalize(() => this.isSaving = false))
      .subscribe({
        next: (res) => {
          if (!res?.status) {
            this._snackbar.openSnackBar(res?.message || 'Failed to save the category', 'error');
            return;
          }

          this._snackbar.openSnackBar(res.message || 'Category saved successfully', 'success');
          this.goBack();
        },
        error: (err) => this._snackbar.openSnackBar(
          err?.error?.message || 'An error occurred while saving the category', 'error'
        )
      });
  }

  goBack(): void {
    this._router.navigate([this.listRoute], { queryParams: { tab: 'categories' } });
  }

  private trimRequiredFields(): void {
    for (const field of ['name', 'display_name']) {
      const control = this.categoryForm.get(field);
      const trimmed = String(control?.value ?? '').trim();
      if (control && trimmed !== control.value) {
        control.setValue(trimmed);
      }
    }
  }

  private nullIfBlank(value: string | null | undefined): string | null {
    const trimmed = String(value ?? '').trim();
    return trimmed ? trimmed : null;
  }
}
