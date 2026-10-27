import { Location } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';

import { INavigationaBar } from '../../../models/ICommon.model';
import { IInventory } from '../../../models/IAdmin.model';
import {
  IRecipe, IRecipeCategory, IRecipeIngredient, IStockCheck, SpiceLevel, Station, STATION_LABELS
} from '../../../models/ICms.model';
import { CmsRecipeService } from '../../../services/cms/recipe.service';
import { InventoryService } from '../../../services/inventory.service';
import { CustomSnackbarService } from '../../../shared/custom-snackbar/custom-snackbar.service';

/**
 * One editable row in the ingredient grid.
 *
 * Not IRecipeIngredient: that is the SERVER's view of a line (it carries
 * line_cost and in_stock, which are outputs). This is the CLIENT's view -- a
 * draft, where `id` may be 0 for a row the operator just added and quantity is
 * still whatever they typed.
 */
interface IIngredientRow {
  id: number;
  inventory_id: number | null;
  inventory_name: string | null;
  quantity: string;
  unit: string;
  is_optional: boolean;
  is_prepped: boolean;
  /** Echoed back after a save, so the operator can see the effect of a change. */
  line_cost?: string;
  in_stock?: boolean;
}

/**
 * Add / edit a menu item on its own route.
 *
 * The ingredient grid only becomes editable once the recipe has an id, because
 * replaceIngredients takes that id in the URL. Creating a recipe therefore
 * stays on this page and rewrites the address to the update route, so the
 * operator can add ingredient lines without reopening the dish.
 *
 * cost_price is deliberately absent: the server derives it from the ingredient
 * lines, and the upsert schema does not accept it.
 */
@Component({
  selector: 'app-manage-recipe',
  standalone: false,
  templateUrl: './manage-recipe.component.html',
  styleUrls: ['../../tables/table-form-page.scss', './manage-recipe.component.scss']
})
export class ManageRecipeComponent implements OnInit {

  private _recipeService = inject(CmsRecipeService);
  private _inventoryService = inject(InventoryService);
  private _snackbar = inject(CustomSnackbarService);
  private _router = inject(Router);
  private _route = inject(ActivatedRoute);
  private _location = inject(Location);
  private _fb = inject(FormBuilder);

  private readonly listRoute = '/cms/recipes';

  readonly stationLabels = STATION_LABELS;
  readonly spiceLevels: SpiceLevel[] = ['none', 'mild', 'medium', 'hot', 'extra_hot'];

  /**
   * Mirrors INGREDIENT_UNITS in recipe_ingredient_schema.py.
   *
   * Wider than the inventory unit allow-list on purpose: a recipe line is often
   * a portion of a bulk stock unit -- "60 ml of oil per burger" has to be
   * expressible even though no inventory row is stored in ml on its own.
   */
  readonly ingredientUnits: string[] = ['pcs', 'kg', 'gm', 'mg', 'ltr', 'ml'];

  navData: INavigationaBar[] = [];
  recipeForm!: FormGroup;

  editingRecipe: IRecipe | null = null;
  isEditMode = false;
  isPageLoad = false;
  isSaving = false;

  categoryList: IRecipeCategory[] = [];
  stationList: string[] = [];

  ingredientRows: IIngredientRow[] = [];
  isIngredientSave = false;
  stockCheck: IStockCheck | null = null;
  isStockLoad = false;

  /// The server's own numbers. Showing our own arithmetic next to a
  /// server-derived cost would guarantee the two drift.
  liveCostPrice: string | null = null;
  liveMarginPercent: string | null = null;

  inventoryList: IInventory[] = [];
  isInventoryLoad = false;

  private readonly categoryRequest = { page_number: 1, page_size: 200, search_value: '' };

  ngOnInit(): void {
    this.initNavigation();
    this.createForm();
    this.loadCategories();
    this.loadStations();

    const recipeId = Number(this._route.snapshot.paramMap.get('id'));
    if (recipeId) {
      this.loadRecipe(recipeId);
    }
  }

  private initNavigation(): void {
    this.navData = [
      { displayValue: 'Home', isClickable: true, isDashboard: false, redirectValue: '/cms/dashboard' },
      { displayValue: 'CMS', isClickable: false, isDashboard: false },
      { displayValue: 'Menu & Recipes', isClickable: true, isDashboard: false, redirectValue: this.listRoute },
      {
        displayValue: this._route.snapshot.data['breadcrumb'] || 'Add Recipe',
        isClickable: false,
        isDashboard: false
      }
    ];
  }

  private createForm(): void {
    this.recipeForm = this._fb.group({
      name: ['', [Validators.required, Validators.maxLength(100)]],
      display_name: ['', [Validators.required, Validators.maxLength(100)]],
      category_id: [null],
      description: ['', Validators.maxLength(1000)],
      instructions: ['', Validators.maxLength(2000)],
      selling_price: [null as number | null, [Validators.required, Validators.min(0)]],
      station: ['other', Validators.required],
      prep_time_minutes: [0, [Validators.min(0), Validators.max(1440)]],
      cook_time_minutes: [0, [Validators.min(0), Validators.max(1440)]],
      is_vegetarian: [false],
      is_vegan: [false],
      is_spicy: [false],
      default_spice_level: [null],
      is_recommended: [false],
      is_available: [true],
      display_order: [0, [Validators.min(0)]],
      is_active: [true]
    }, { validators: [this.veganImpliesVegetarian()] });

    /**
     * Turning Vegan on ticks Vegetarian too. The schema rejects
     * vegan-without-vegetarian, and an operator who ticks only Vegan has not
     * made a mistake they can see.
     */
    this.recipeForm.get('is_vegan')?.valueChanges.subscribe((vegan: boolean) => {
      if (vegan) {
        const veg = this.recipeForm.get('is_vegetarian');
        if (veg && !veg.value) {
          veg.setValue(true);
          veg.markAsDirty();
        }
      }
    });
  }

  /**
   * Schema guard, mirrored client-side so the error lands on the control the
   * operator has to fix instead of arriving as a bare 400 on is_vegetarian.
   */
  private veganImpliesVegetarian(): (group: AbstractControl) => ValidationErrors | null {
    return (group: AbstractControl): ValidationErrors | null => {
      const vegan = group.get('is_vegan')?.value;
      const vegetarian = group.get('is_vegetarian')?.value;
      return vegan && !vegetarian ? { veganRequiresVegetarian: true } : null;
    };
  }

  //// ------------------------------------------------------------------
  ////  Reads
  //// ------------------------------------------------------------------

  private loadRecipe(recipeId: number): void {
    this.isPageLoad = true;
    this._recipeService.getRecipeById(recipeId)
      .pipe(finalize(() => this.isPageLoad = false))
      .subscribe({
        next: (res) => {
          if (!res?.status || !res.data) {
            this._snackbar.openSnackBar(res?.message || 'Failed to load the recipe', 'error');
            return;
          }

          const recipe = res.data as IRecipe;
          this.isEditMode = true;
          this.editingRecipe = recipe;
          this.applyRecipeToForm(recipe);

          this.ingredientRows = (recipe.ingredients || []).map((ing: IRecipeIngredient) => ({
            id: ing.id || 0,
            inventory_id: ing.inventory_id ?? null,
            inventory_name: ing.inventory_name ?? null,
            quantity: this.formatQuantity(ing.quantity),
            unit: ing.unit || 'pcs',
            is_optional: !!ing.is_optional,
            is_prepped: !!ing.is_prepped,
            line_cost: ing.line_cost,
            in_stock: ing.in_stock
          }));
          this.liveCostPrice = recipe.cost_price ?? null;
          this.liveMarginPercent = recipe.margin_percent ?? null;

          this.ensureInventoryLoaded();
          this.checkStock();
        },
        error: (err) => {
          const msg = err?.status === 404
            ? 'This recipe no longer exists.'
            : (err?.error?.message || 'An error occurred while loading the recipe');
          this._snackbar.openSnackBar(msg, 'error');
        }
      });
  }

  private applyRecipeToForm(recipe: IRecipe): void {
    this.recipeForm.patchValue({
      name: recipe.name || '',
      display_name: recipe.display_name || '',
      category_id: recipe.category_id ?? null,
      description: recipe.description || '',
      instructions: recipe.instructions || '',
      selling_price: Number(recipe.selling_price || 0),
      station: recipe.station || 'other',
      prep_time_minutes: recipe.prep_time_minutes ?? 0,
      cook_time_minutes: recipe.cook_time_minutes ?? 0,
      is_vegetarian: !!recipe.is_vegetarian,
      is_vegan: !!recipe.is_vegan,
      is_spicy: !!recipe.is_spicy,
      default_spice_level: recipe.default_spice_level ?? null,
      is_recommended: !!recipe.is_recommended,
      is_available: recipe.is_available ?? true,
      display_order: recipe.display_order ?? 0,
      is_active: recipe.is_active ?? true
    });
  }

  private loadCategories(): void {
    this._recipeService.getCategories(this.categoryRequest)
      .subscribe({
        next: (res) => {
          if (res?.status) {
            this.categoryList = res.data || [];
          }
        },
        error: (err) => this._snackbar.openSnackBar(
          err?.error?.message || 'An error occurred while fetching recipe categories', 'error'
        )
      });
  }

  /**
   * Stations come from the seeded enum table. If the enum seeder has not run,
   * fall back to the compiled-in labels so the form stays usable; the server
   * still rejects anything genuinely invalid.
   */
  private loadStations(): void {
    this._recipeService.getStations()
      .subscribe({
        next: (res) => {
          this.stationList = res?.status && Array.isArray(res.data) ? res.data : [];
        },
        error: () => {
          this.stationList = Object.keys(STATION_LABELS);
        }
      });
  }

  private ensureInventoryLoaded(): void {
    if (this.inventoryList.length || this.isInventoryLoad) return;

    this.isInventoryLoad = true;
    this._inventoryService.getInventories({ page_number: 1, page_size: 500 })
      .pipe(finalize(() => this.isInventoryLoad = false))
      .subscribe({
        next: (res) => {
          if (res?.status) {
            this.inventoryList = res.data || [];
          } else {
            this._snackbar.openSnackBar(res?.message || 'Failed to fetch inventory items', 'error');
          }
        },
        error: (err) => this._snackbar.openSnackBar(
          err?.error?.message || 'An error occurred while fetching inventory items', 'error'
        )
      });
  }

  //// ------------------------------------------------------------------
  ////  Recipe save
  //// ------------------------------------------------------------------

  saveRecipe(): void {
    /// Trim before validating: neither field may be blank once trimmed, and the
    /// server treats the trimmed value as the unique name.
    this.trimRequiredFields();

    if (this.recipeForm.invalid) {
      this.recipeForm.markAllAsTouched();
      this._snackbar.openSnackBar('Please correct the highlighted fields', 'warn');
      return;
    }

    this.isSaving = true;
    const value = this.recipeForm.value;

    /**
     * cost_price is NOT in this payload. The server derives it from the
     * ingredient lines and does not accept it from a client -- sending one
     * would let the header margin and the ingredient editor disagree.
     */
    const payload = {
      id: this.editingRecipe?.id || 0,
      name: String(value.name ?? '').trim(),
      display_name: String(value.display_name ?? '').trim(),
      category_id: value.category_id || null,
      description: this.nullIfBlank(value.description),
      instructions: this.nullIfBlank(value.instructions),
      selling_price: value.selling_price,
      station: value.station,
      prep_time_minutes: value.prep_time_minutes || 0,
      cook_time_minutes: value.cook_time_minutes || 0,
      is_vegetarian: !!value.is_vegetarian,
      is_vegan: !!value.is_vegan,
      is_spicy: !!value.is_spicy,
      default_spice_level: value.default_spice_level || null,
      is_recommended: !!value.is_recommended,
      is_available: !!value.is_available,
      display_order: value.display_order || 0,
      is_active: !!value.is_active,
      is_deleted: false
    };

    const wasCreate = !this.editingRecipe?.id;

    this._recipeService.upsertRecipe(payload)
      .pipe(finalize(() => this.isSaving = false))
      .subscribe({
        next: (res) => {
          if (!res?.status) {
            this._snackbar.openSnackBar(res?.message || 'Failed to save the recipe', 'error');
            return;
          }

          this._snackbar.openSnackBar(res.message || 'Recipe saved successfully', 'success');

          const saved = res.data as IRecipe;
          if (saved?.id) {
            this.editingRecipe = saved;
            this.isEditMode = true;
            this.liveCostPrice = saved.cost_price ?? this.liveCostPrice;
            this.liveMarginPercent = saved.margin_percent ?? this.liveMarginPercent;

            if (wasCreate) {
              /// Rewrite the address, not the route: navigating would re-create
              /// this component and throw away anything typed into the
              /// ingredient grid after the recipe got its id.
              this._location.replaceState(`${this.listRoute}/update-recipe/${saved.id}`);
              this.ensureInventoryLoaded();
            }
          }
        },
        error: (err) => this._snackbar.openSnackBar(
          err?.error?.message || 'An error occurred while saving the recipe', 'error'
        )
      });
  }

  goBack(): void {
    this._router.navigate([this.listRoute]);
  }

  //// ------------------------------------------------------------------
  ////  Ingredient grid
  //// ------------------------------------------------------------------

  addIngredientRow(): void {
    // The unit defaults to pcs and then follows the chosen inventory item:
    // a line saying "2 pcs of 1 kg flour" is a unit error waiting to happen.
    this.ingredientRows = [...this.ingredientRows, {
      id: 0,
      inventory_id: null,
      inventory_name: null,
      quantity: '1',
      unit: 'pcs',
      is_optional: false,
      is_prepped: false
    }];
  }

  removeIngredientRow(index: number): void {
    this.ingredientRows = this.ingredientRows.filter((_, i) => i !== index);
  }

  onInventoryPicked(row: IIngredientRow, inventoryId: number | null): void {
    const item = this.inventoryList.find(i => i.id === inventoryId);
    row.inventory_id = inventoryId;
    row.inventory_name = item?.name ?? null;
    if (item?.unit) {
      row.unit = item.unit;
    }
  }

  /**
   * Save the whole grid in one call. replaceIngredients matches rows by
   * inventory_id, so a new row's id is 0 and any inventory_id missing from the
   * payload is removed server-side.
   */
  saveIngredients(): void {
    const recipeId = this.editingRecipe?.id;
    if (!recipeId) {
      this._snackbar.openSnackBar('Save the recipe first, then add its ingredients', 'warn');
      return;
    }

    if (this.ingredientRows.length === 0) {
      // Legal but almost certainly a mistake: a recipe with no lines costs 0 and
      // the margin column silently reads 100%.
      this._snackbar.openSnackBar('This recipe has no ingredient lines yet', 'warn');
      return;
    }

    const invalidRow = this.ingredientRows.findIndex(r => !r.inventory_id || !Number(r.quantity) || !r.unit);
    if (invalidRow > -1) {
      this._snackbar.openSnackBar(`Row ${invalidRow + 1} needs an item, a quantity and a unit`, 'warn');
      return;
    }

    // The schema enforces one row per inventory item; catching it here points at
    // the row instead of surfacing a nested field_name the operator cannot see.
    const seen = new Set<number>();
    const dupIndex = this.ingredientRows.findIndex(r => {
      const id = r.inventory_id as number;
      if (seen.has(id)) return true;
      seen.add(id);
      return false;
    });
    if (dupIndex > -1) {
      this._snackbar.openSnackBar(`Row ${dupIndex + 1} repeats an item already in the list`, 'warn');
      return;
    }

    this.isIngredientSave = true;
    const payload = this.ingredientRows.map(r => ({
      id: r.id || 0,
      inventory_id: r.inventory_id,
      quantity: r.quantity,
      unit: r.unit,
      is_optional: !!r.is_optional,
      is_prepped: !!r.is_prepped
    }));

    this._recipeService.replaceIngredients(recipeId, payload)
      .pipe(finalize(() => this.isIngredientSave = false))
      .subscribe({
        next: (res) => {
          if (!res?.status) {
            this._snackbar.openSnackBar(res?.message || 'Failed to save ingredients', 'error');
            return;
          }

          this._snackbar.openSnackBar(res.message || 'Ingredients saved', 'success');

          /// Adopt the server's rows rather than keeping the drafts: it
          /// assigned ids to new lines and restated the costs.
          this.ingredientRows = (res.data?.ingredients || []).map((ing: IRecipeIngredient) => ({
            id: ing.id || 0,
            inventory_id: ing.inventory_id ?? null,
            inventory_name: ing.inventory_name ?? null,
            quantity: this.formatQuantity(ing.quantity),
            unit: ing.unit || 'pcs',
            is_optional: !!ing.is_optional,
            is_prepped: !!ing.is_prepped,
            line_cost: ing.line_cost,
            in_stock: ing.in_stock
          }));
          this.liveCostPrice = res.data?.cost_price ?? null;
          this.liveMarginPercent = res.data?.margin_percent ?? null;

          this.checkStock();
        },
        error: (err) => this._snackbar.openSnackBar(
          err?.error?.message || 'An error occurred while saving ingredients', 'error'
        )
      });
  }

  /**
   * "Can we make this right now, and how many portions?" The recipe row cannot
   * answer it -- the recipe knows its ingredients, not what is on the shelf.
   */
  checkStock(): void {
    const recipeId = this.editingRecipe?.id;
    if (!recipeId) return;

    this.isStockLoad = true;
    this._recipeService.checkStock(recipeId)
      .pipe(finalize(() => this.isStockLoad = false))
      .subscribe({
        next: (res) => {
          this.stockCheck = res?.status ? res.data : null;
        },
        error: (err) => this._snackbar.openSnackBar(
          err?.error?.message || 'Could not check ingredient stock', 'error'
        )
      });
  }

  //// ------------------------------------------------------------------
  ////  Template helpers
  //// ------------------------------------------------------------------

  /**
   * Label for a station, with a fallback for values the enum table knows but
   * STATION_LABELS does not.
   */
  stationLabel(station?: Station | string | null): string {
    if (!station) return 'Other';
    const known = this.stationLabels[station as Station];
    if (known) return known;
    return station.charAt(0).toUpperCase() + station.slice(1);
  }

  /** Schema guard surfaced inline so the operator is told WHICH flag to fix. */
  get veganNeedsVegetarian(): boolean {
    return !!this.recipeForm?.errors?.['veganRequiresVegetarian'];
  }

  private trimRequiredFields(): void {
    for (const field of ['name', 'display_name']) {
      const control = this.recipeForm.get(field);
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

  /**
   * quantity is Numeric(10,3), but SQLite hands a Decimal back as a float, so
   * 0.050 arrives as 0.05000000074505806 and would be typed into the grid as
   * such. Rounding to the column's own scale drops the noise without losing
   * any precision the backend keeps.
   */
  private formatQuantity(value: string | number | null | undefined): string {
    const num = Number(value ?? 0);
    if (!Number.isFinite(num)) return '0';
    return String(Number(num.toFixed(3)));
  }
}
