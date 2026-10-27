import { Component, inject, OnInit } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';

import { IGenricGrid, INavigationaBar } from '../../models/ICommon.model';
import { IRecipe, IRecipeCategory, Station, STATION_LABELS, toAmount } from '../../models/ICms.model';
import { CmsRecipeService } from '../../services/cms/recipe.service';
import { ConfirmationService } from '../../services/confirmation.service';
import { CustomSnackbarService } from '../../shared/custom-snackbar/custom-snackbar.service';
import { PAGE_SIZE_SELECT_CONFIG } from '../../shared/paginator-config';

/**
 * Menu & recipe management.
 *
 * The recipes tab is the admin view of the menu, the categories tab is the
 * reference data behind it. They live together because a recipe is worthless
 * without a category to sit in on the POS menu.
 *
 * Adding and editing happen on their own routes (add-recipe / update-recipe and
 * add-category / update-category). This screen owns the list, the 86 switch and
 * the delete flows.
 *
 * Two things this screen deliberately does NOT let the operator do by hand,
 * each because the server owns that value:
 *  - set cost_price (derived from the ingredient lines),
 *  - sell an 86'd dish (is_available is a switch, not a field).
 */
@Component({
  selector: 'app-recipe-list',
  standalone: false,
  templateUrl: './recipe-list.component.html',
  styleUrl: './recipe-list.component.scss'
})
export class RecipeListComponent implements OnInit {

  //// Inject Services
  private _recipeService = inject(CmsRecipeService);
  private _snackbar = inject(CustomSnackbarService);
  private _confirmService = inject(ConfirmationService);
  private _router = inject(Router);
  private _route = inject(ActivatedRoute);

  //// Constants
  readonly stationLabels = STATION_LABELS;
  readonly pageSizeSelect = PAGE_SIZE_SELECT_CONFIG;

  private readonly listRoute = '/cms/recipes';

  //// State Properties
  navData: INavigationaBar[] = [];
  selectedTabIndex = 0;

  isPageLoad = false;
  isCategoryLoad = false;

  // ---- recipes tab ----
  gridSearch = '';
  filterCategoryId: number | null = null;
  filterStation: string | null = null;
  /// Tri-state so "Available" and "86'd" are both selectable filters; a
  /// boolean-only control could never express "show me everything".
  filterAvailability: boolean | null = null;

  recipeList: IRecipe[] = [];
  recipeDataSource = new MatTableDataSource<IRecipe>();
  displayedColumns: string[] = ['sr', 'display_name', 'category_display_name', 'selling_price', 'cost_price', 'margin_percent', 'station', 'total_time_minutes', 'is_available', 'actions'];
  pageDet: IGenricGrid = { total_docs: 0, limit: 10 };

  categoryList: IRecipeCategory[] = [];
  stationList: string[] = [];

  categoryDataSource = new MatTableDataSource<IRecipeCategory>();
  categoryColumns: string[] = ['sr', 'name', 'display_name', 'description', 'display_order', 'recipe_count', 'is_active', 'actions'];

  /// ids with an in-flight availability flip, so a fast double toggle cannot
  /// send two updateAvailability calls and leave the row showing the older value.
  busyIds = new Set<number>();

  //// Request State
  private requestData = {
    page_number: 1,
    page_size: 10,
    search_value: '',
    category_id: null as number | null,
    station: null as string | null,
    is_available: null as boolean | null
  };

  private categoryRequest = { page_number: 1, page_size: 200, search_value: '' };

  ngOnInit(): void {
    this.initNavigation();
    this.selectedTabIndex = this._route.snapshot.queryParamMap.get('tab') === 'categories' ? 1 : 0;
    this.loadCategories();
    this.loadStations();
    this.fetchRecipes();
  }

  //// ------------------------------------------------------------------
  ////  Navigation
  //// ------------------------------------------------------------------

  private initNavigation(): void {
    this.navData = [
      { displayValue: 'Home', isClickable: true, isDashboard: false, redirectValue: '/cms/dashboard' },
      { displayValue: 'Menu & Recipes', isClickable: false, isDashboard: false }
    ];
  }

  /**
   * Keeps the active tab in the query string. The category form returns to
   * ?tab=categories, and a reload of that address has to land on the same tab.
   */
  onTabChange(index: number): void {
    this.selectedTabIndex = index;
    this._router.navigate([], {
      relativeTo: this._route,
      queryParams: index === 1 ? { tab: 'categories' } : {},
      replaceUrl: true
    });
  }

  onAddRecipe(): void {
    this._router.navigate([`${this.listRoute}/add-recipe`]);
  }

  onEditRecipe(recipe: IRecipe): void {
    if (!recipe.id) return;
    this._router.navigate([`${this.listRoute}/update-recipe`, recipe.id]);
  }

  onAddCategory(): void {
    this._router.navigate([`${this.listRoute}/add-category`]);
  }

  onEditCategory(category: IRecipeCategory): void {
    if (!category.id) return;
    this._router.navigate([`${this.listRoute}/update-category`, category.id]);
  }

  //// ------------------------------------------------------------------
  ////  Reads
  //// ------------------------------------------------------------------

  private fetchRecipes(): void {
    this.isPageLoad = true;
    this.requestData.search_value = this.gridSearch;

    this._recipeService.getRecipes(this.requestData)
      .pipe(finalize(() => this.isPageLoad = false))
      .subscribe({
        next: (res) => {
          if (!res?.status) {
            this._snackbar.openSnackBar(res?.message || 'Failed to fetch recipes', 'error');
            return;
          }
          this.recipeList = res.data || [];
          this.pageDet.total_docs = res.meta?.total_records || 0;
          this.pageDet.limit = this.requestData.page_size;
          this.recipeDataSource.data = this.recipeList;
        },
        error: (err) => this._snackbar.openSnackBar(
          err?.error?.message || 'An error occurred while fetching recipes', 'error'
        )
      });
  }

  private loadCategories(): void {
    this.isCategoryLoad = true;
    this._recipeService.getCategories(this.categoryRequest)
      .pipe(finalize(() => this.isCategoryLoad = false))
      .subscribe({
        next: (res) => {
          if (!res?.status) {
            this._snackbar.openSnackBar(res?.message || 'Failed to fetch recipe categories', 'error');
            return;
          }
          this.categoryList = res.data || [];
          this.categoryDataSource.data = this.categoryList;
        },
        error: (err) => this._snackbar.openSnackBar(
          err?.error?.message || 'An error occurred while fetching recipe categories', 'error'
        )
      });
  }

  /**
   * Stations come from the seeded enum table, not from a hardcoded list here.
   * The schema cannot validate station itself (marshmallow is static), so the
   * enum table is the single source of truth -- a literal list in this
   * component would be a second copy that drifts the day an admin adds a
   * station. STATION_LABELS only supplies the display words.
   */
  private loadStations(): void {
    this._recipeService.getStations()
      .subscribe({
        next: (res) => {
          this.stationList = res?.status && Array.isArray(res.data) ? res.data : [];
        },
        error: () => {
          // 503 means the enum seeder has not been run. Fall back to the
          // compiled-in list so the filter is still usable.
          this.stationList = Object.keys(STATION_LABELS);
        }
      });
  }

  //// ------------------------------------------------------------------
  ////  UI Event Handlers — recipes tab
  //// ------------------------------------------------------------------

  onPaginateChange(e: any): void {
    this.requestData.page_number = e.pageIndex + 1;
    this.requestData.page_size = e.pageSize;
    this.fetchRecipes();
  }

  /**
   * Same three-character threshold as the inventory lists, for the same reason:
   * the backend search is a LIKE on name / recipe_code, so one character returns
   * most of the menu and the pager stops meaning anything.
   */
  applyFilter(): void {
    if (this.gridSearch.length >= 3 || this.gridSearch.length === 0) {
      this.requestData.page_number = 1;
      this.fetchRecipes();
    }
  }

  onCategoryFilter(): void {
    this.requestData.category_id = this.filterCategoryId;
    this.requestData.page_number = 1;
    this.fetchRecipes();
  }

  onStationFilter(): void {
    this.requestData.station = this.filterStation;
    this.requestData.page_number = 1;
    this.fetchRecipes();
  }

  onAvailabilityFilter(): void {
    this.requestData.is_available = this.filterAvailability;
    this.requestData.page_number = 1;
    this.fetchRecipes();
  }

  clearFilter(): void {
    this.gridSearch = '';
    this.filterCategoryId = null;
    this.filterStation = null;
    this.filterAvailability = null;
    this.requestData.search_value = '';
    this.requestData.category_id = null;
    this.requestData.station = null;
    this.requestData.is_available = null;
    this.requestData.page_number = 1;
    this.fetchRecipes();
  }

  //// ------------------------------------------------------------------
  ////  86 / un-86
  //// ------------------------------------------------------------------

  /**
   * The one-tap availability switch.
   *
   * Deliberately NOT a slide-toggle bound straight to is_available: that would
   * flip the model before the server agrees, so a failed call would leave a
   * dish showing as sellable when the POS has already refused it. The row only
   * changes once updateAvailability comes back true.
   */
  onToggleAvailability(recipe: IRecipe, isAvailable: boolean): void {
    if (!recipe.id || this.busyIds.has(recipe.id)) return;

    this.busyIds.add(recipe.id);
    this._recipeService.updateAvailability(recipe.id, isAvailable)
      .pipe(finalize(() => this.busyIds.delete(recipe.id!)))
      .subscribe({
        next: (res) => {
          if (res?.status) {
            recipe.is_available = isAvailable;
            this._snackbar.openSnackBar(
              res.message || (isAvailable ? 'Recipe is back on the menu' : 'Recipe 86\'d'), 'success'
            );
          } else {
            this._snackbar.openSnackBar(res?.message || 'Failed to change availability', 'error');
            // Re-read the row so the switch cannot keep showing a value the
            // server never accepted.
            this.fetchRecipes();
          }
        },
        error: (err) => {
          this._snackbar.openSnackBar(
            err?.error?.message || 'An error occurred while changing availability', 'error'
          );
          this.fetchRecipes();
        }
      });
  }

  //// ------------------------------------------------------------------
  ////  Deletes
  //// ------------------------------------------------------------------

  onDeleteRecipe(recipe: IRecipe): void {
    (document.activeElement as HTMLElement)?.blur();

    this._confirmService
      .confirm(
        'Delete this recipe?',
        `${recipe.display_name || recipe.name} will be removed from the menu and 86'd immediately. ` +
        'Historical orders keep their own copy of the name and price.',
        'Yes, Delete it!'
      )
      .then((result) => {
        if (result.isConfirmed) {
          this.executeDeleteRecipe(recipe);
        }
      });
  }

  private executeDeleteRecipe(recipe: IRecipe): void {
    if (!recipe.id) return;

    this.isPageLoad = true;

    /**
     * Soft delete through the same upsert -- there is no DELETE endpoint.
     * is_available goes false alongside is_active so a deleted dish stops
     * being sellable in the same call rather than lingering on the POS menu
     * until someone notices.
     */
    this._recipeService.upsertRecipe({
      id: recipe.id,
      name: recipe.name,
      display_name: recipe.display_name || recipe.name,
      category_id: recipe.category_id ?? null,
      description: recipe.description || null,
      selling_price: recipe.selling_price,
      station: recipe.station,
      prep_time_minutes: recipe.prep_time_minutes ?? 0,
      cook_time_minutes: recipe.cook_time_minutes ?? 0,
      is_vegetarian: !!recipe.is_vegetarian,
      is_vegan: !!recipe.is_vegan,
      is_spicy: !!recipe.is_spicy,
      is_recommended: !!recipe.is_recommended,
      is_available: false,
      display_order: recipe.display_order ?? 0,
      is_active: false,
      is_deleted: true
    })
      .pipe(finalize(() => this.isPageLoad = false))
      .subscribe({
        next: (res) => {
          if (res?.status) {
            this._snackbar.openSnackBar(res.message || 'Recipe deleted successfully', 'success');
            this.fetchRecipes();
            this.loadCategories();
          } else {
            this._snackbar.openSnackBar(res?.message || 'Failed to delete the recipe', 'error');
          }
        },
        error: (err) => this._snackbar.openSnackBar(
          err?.error?.message || 'An error occurred while deleting the recipe', 'error'
        )
      });
  }

  onDeleteCategory(category: IRecipeCategory): void {
    (document.activeElement as HTMLElement)?.blur();

    /**
     * The backend does NOT cascade: the recipe -> category_id FK is
     * ON DELETE SET NULL, so deleting a category leaves its recipes alive and
     * they fall into "Uncategorised" on the POS menu. Recoverable, but only if
     * the operator is told the number before they click.
     */
    const count = category.recipe_count ?? 0;
    const warning = count > 0
      ? `${count} recipe${count === 1 ? '' : 's'} will move to "Uncategorised" on the POS menu. The recipes are not deleted.`
      : 'This category has no recipes.';

    this._confirmService
      .confirm('Delete this category?', warning, 'Yes, Delete it!')
      .then((result) => {
        if (result.isConfirmed) {
          this.executeDeleteCategory(category);
        }
      });
  }

  private executeDeleteCategory(category: IRecipeCategory): void {
    if (!category.id) return;

    this.isCategoryLoad = true;
    this._recipeService.upsertCategory({
      id: category.id,
      name: category.name,
      display_name: category.display_name || category.name,
      description: category.description || null,
      display_order: category.display_order ?? 0,
      is_active: false,
      is_deleted: true
    })
      .pipe(finalize(() => this.isCategoryLoad = false))
      .subscribe({
        next: (res) => {
          if (res?.status) {
            this._snackbar.openSnackBar(res.message || 'Category deleted successfully', 'success');
            this.loadCategories();
          } else {
            this._snackbar.openSnackBar(res?.message || 'Failed to delete the category', 'error');
          }
        },
        error: (err) => this._snackbar.openSnackBar(
          err?.error?.message || 'An error occurred while deleting the category', 'error'
        )
      });
  }

  //// ------------------------------------------------------------------
  ////  Template helpers
  //// ------------------------------------------------------------------

  /**
   * Colour the margin by band rather than printing a bare number.
   *
   * A dish selling below or barely above cost is the thing a manager needs to
   * catch on this screen, and a percentage sitting in the same neutral grey as
   * a healthy one does not get caught.
   */
  marginClass(recipe: IRecipe): string {
    const pct = toAmount(recipe.margin_percent);
    if (pct < 0) return 'm-loss';
    if (pct < 30) return 'm-thin';
    if (pct < 50) return 'm-ok';
    return 'm-good';
  }

  /**
   * Label for a station, with a fallback for values the enum table knows but
   * STATION_LABELS does not. An admin can add a station at runtime; the screen
   * must then show the raw key rather than "undefined".
   */
  stationLabel(station?: Station | string | null): string {
    if (!station) return 'Other';
    const known = this.stationLabels[station as Station];
    if (known) return known;
    return station.charAt(0).toUpperCase() + station.slice(1);
  }

  /** Class fragment so station pills share the CMS status palette. */
  stationClass(station?: Station | string | null): string {
    return station ? `stn-${station}` : 'stn-other';
  }

  categoryLabel(recipe: IRecipe): string {
    return recipe.category_display_name || recipe.category_name || 'Uncategorised';
  }

  isBusy(id?: number): boolean {
    return !!id && this.busyIds.has(id);
  }

  getSrNo(index: number): number {
    return (this.requestData.page_size * (this.requestData.page_number - 1)) + (index + 1);
  }

  get currentPageIndex(): number {
    return this.requestData.page_number - 1;
  }

  get currentPage(): number {
    return this.requestData.page_number;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.pageDet.total_docs / this.requestData.page_size));
  }
}
