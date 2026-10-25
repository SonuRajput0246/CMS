import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { SharedModule } from '../../shared/shared.module';
import { AppConfig } from '../../core/config/config';
import { CustomSnackbarService } from '../../shared/custom-snackbar/custom-snackbar.service';
import { IRecipe } from '../../models/ICms.model';

import { RecipeListComponent } from './recipe-list.component';

class MockSnackbarService {
  openSnackBar = jasmine.createSpy('openSnackBar');
}

describe('RecipeListComponent', () => {
  let component: RecipeListComponent;
  let fixture: ComponentFixture<RecipeListComponent>;
  let httpMock: HttpTestingController;
  let snackbar: MockSnackbarService;

  const base = 'http://localhost:5000';
  const recipeUrl = `${base}/api/v1/recipe/get`;
  const categoryUrl = `${base}/api/v1/recipe-category/get`;
  const stationsUrl = `${base}/api/v1/recipe/get-stations`;

  const recipeRows: IRecipe[] = [
    {
      id: 1, name: 'paneer_tikka', display_name: 'Paneer Tikka', category_id: 2,
      category_display_name: 'Starters', selling_price: '240.00', cost_price: '97.25',
      margin_percent: '59.48', station: 'tandoor', total_time_minutes: 25, is_available: true
    },
    {
      id: 2, name: 'house_burger', display_name: 'House Burger', category_id: 3,
      category_display_name: 'Mains', selling_price: '180.00', cost_price: '140.00',
      margin_percent: '22.22', station: 'grill', total_time_minutes: 15, is_available: false
    }
  ];

  function flushRecipes(body?: any): void {
    /// Fresh row objects each time: the component mutates is_available in
    /// place, so a shared fixture would leak state from one spec into the next.
    httpMock.expectOne(req => req.method === 'POST' && req.url === recipeUrl).flush(
      body ?? { status: true, data: recipeRows.map(r => ({ ...r })), meta: { total_records: 2 } }
    );
  }

  function flushCategories(): void {
    httpMock.expectOne(req => req.method === 'POST' && req.url === categoryUrl).flush({
      status: true,
      data: [{ id: 2, name: 'starters', display_name: 'Starters', recipe_count: 4, is_active: true }],
      meta: { total_records: 1 }
    });
  }

  function flushStations(): void {
    httpMock.expectOne(req => req.method === 'GET' && req.url === stationsUrl).flush({
      status: true,
      data: ['grill', 'fry', 'tandoor', 'other']
    });
  }

  function flushInit(): void {
    flushCategories();
    flushStations();
    flushRecipes();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SharedModule, RouterTestingModule, NoopAnimationsModule],
      declarations: [RecipeListComponent],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: CustomSnackbarService, useClass: MockSnackbarService }
      ]
    }).compileComponents();

    TestBed.inject(AppConfig).set('BASE_URL', base);
    httpMock = TestBed.inject(HttpTestingController);
    snackbar = TestBed.inject(CustomSnackbarService) as unknown as MockSnackbarService;

    fixture = TestBed.createComponent(RecipeListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    flushInit();
  });

  afterEach(() => {
    fixture.destroy();
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads recipes, categories and stations on init', () => {
    expect(component.recipeList.length).toBe(2);
    expect(component.pageDet.total_docs).toBe(2);
    expect(component.categoryList.length).toBe(1);
    expect(component.stationList).toContain('tandoor');
    expect(component.defaultStation).toBe('other');
  });

  //// ---- filters ------------------------------------------------------

  it('applies the search filter at 3+ characters', () => {
    component.gridSearch = 'Pan';
    component.applyFilter();

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === recipeUrl &&
      req.body.search_value === 'Pan' && req.body.page_number === 1
    ).flush({ status: true, data: [], meta: { total_records: 0 } });
  });

  it('does not search below 3 characters', () => {
    component.gridSearch = 'Pa';
    component.applyFilter();

    httpMock.expectNone(recipeUrl);
  });

  it('applies category, station and availability filters', () => {
    component.filterCategoryId = 2;
    component.onCategoryFilter();
    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === recipeUrl && req.body.category_id === 2
    ).flush({ status: true, data: [], meta: { total_records: 0 } });

    component.filterStation = 'tandoor';
    component.onStationFilter();
    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === recipeUrl && req.body.station === 'tandoor'
    ).flush({ status: true, data: [], meta: { total_records: 0 } });

    component.filterAvailability = false;
    component.onAvailabilityFilter();
    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === recipeUrl && req.body.is_available === false
    ).flush({ status: true, data: [], meta: { total_records: 0 } });
  });

  it('clears every filter and refetches page one', () => {
    component.gridSearch = 'Pan';
    component.filterCategoryId = 2;
    component.filterStation = 'tandoor';
    component.filterAvailability = true;

    component.clearFilter();

    expect(component.gridSearch).toBe('');
    expect(component.filterCategoryId).toBeNull();
    expect(component.filterStation).toBeNull();
    expect(component.filterAvailability).toBeNull();

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === recipeUrl &&
      req.body.search_value === '' && req.body.category_id === null &&
      req.body.station === null && req.body.is_available === null &&
      req.body.page_number === 1
    ).flush({ status: true, data: [], meta: { total_records: 0 } });
  });

  //// ---- 86 toggle ----------------------------------------------------

  it('flips availability only after the server accepts', () => {
    const recipe = component.recipeList[0];

    component.onToggleAvailability(recipe, false);
    expect(recipe.is_available).toBeTrue();
    expect(component.isBusy(recipe.id)).toBeTrue();

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/recipe/update-availability` &&
      req.body.id === 1 && req.body.is_available === false
    ).flush({ status: true, message: "Recipe 86'd" });

    expect(recipe.is_available).toBeFalse();
    expect(component.isBusy(recipe.id)).toBeFalse();
  });

  it('ignores a second toggle while one is in flight', () => {
    const recipe = component.recipeList[0];

    component.onToggleAvailability(recipe, false);
    component.onToggleAvailability(recipe, true);

    httpMock.expectOne(`${base}/api/v1/recipe/update-availability`)
      .flush({ status: true, message: "Recipe 86'd" });

    expect(recipe.is_available).toBeFalse();
  });

  it('refetches the row when the availability update is rejected', () => {
    const recipe = component.recipeList[0];

    component.onToggleAvailability(recipe, false);
    httpMock.expectOne(`${base}/api/v1/recipe/update-availability`)
      .flush({ status: false, message: 'Not allowed' });

    expect(recipe.is_available).toBeTrue();
    expect(snackbar.openSnackBar).toHaveBeenCalledWith('Not allowed', 'error');

    flushRecipes();
  });

  //// ---- recipe dialog ------------------------------------------------

  it('rejects an invalid recipe form without sending a request', () => {
    component.saveRecipe({ close: () => { } });

    expect(snackbar.openSnackBar).toHaveBeenCalledWith('Please correct the highlighted fields', 'warn');
    expect(component.recipeForm.valid).toBeFalse();
    httpMock.expectNone(`${base}/api/v1/recipe/upsert`);
  });

  it('saves the recipe without a client-side cost_price', () => {
    component.editingRecipe = recipeRows[0];
    component.recipeForm.patchValue({
      name: 'paneer_tikka',
      display_name: 'Paneer Tikka',
      category_id: 2,
      selling_price: 240,
      station: 'tandoor',
      is_vegetarian: true,
      is_available: true,
      is_active: true
    });

    component.saveRecipe({ close: () => { } });

    const req = httpMock.expectOne(`${base}/api/v1/recipe/upsert`);
    const body = req.request.body;
    expect(body.id).toBe(1);
    expect(body.name).toBe('paneer_tikka');
    expect(body.selling_price).toBe(240);
    expect(body.is_deleted).toBeFalse();
    expect(body.cost_price).toBeUndefined();

    req.flush({ status: true, message: 'Recipe saved', data: { id: 1 } });
    flushRecipes();
    flushCategories();
  });

  it('ticks vegetarian when vegan is selected', () => {
    component.recipeForm.get('is_vegan')?.setValue(true);

    expect(component.recipeForm.get('is_vegetarian')?.value).toBeTrue();
    expect(component.veganNeedsVegetarian).toBeFalse();
  });

  //// ---- ingredient grid ---------------------------------------------

  it('refuses to save ingredients before the recipe exists', () => {
    component.ingredientRows = [{
      id: 0, inventory_id: 2, inventory_name: 'Paneer',
      quantity: '1', unit: 'kg', is_optional: false, is_prepped: false
    }];

    component.saveIngredients();

    expect(snackbar.openSnackBar).toHaveBeenCalledWith('Save the recipe first, then add its ingredients', 'warn');
    httpMock.expectNone(req => req.url.includes('/recipe-ingredient/'));
  });

  it('refuses a row with no item, quantity or unit', () => {
    component.editingRecipe = { id: 7 };
    component.ingredientRows = [{
      id: 0, inventory_id: null, inventory_name: null,
      quantity: '1', unit: 'pcs', is_optional: false, is_prepped: false
    }];

    component.saveIngredients();

    expect(snackbar.openSnackBar).toHaveBeenCalledWith('Row 1 needs an item, a quantity and a unit', 'warn');
    httpMock.expectNone(req => req.url.includes('/recipe-ingredient/'));
  });

  it('refuses duplicate inventory rows before hitting the schema', () => {
    component.editingRecipe = { id: 7 };
    component.ingredientRows = [
      { id: 0, inventory_id: 2, inventory_name: 'Paneer', quantity: '1', unit: 'kg', is_optional: false, is_prepped: false },
      { id: 0, inventory_id: 2, inventory_name: 'Paneer', quantity: '2', unit: 'kg', is_optional: false, is_prepped: false }
    ];

    component.saveIngredients();

    expect(snackbar.openSnackBar).toHaveBeenCalledWith('Row 2 repeats an item already in the list', 'warn');
    httpMock.expectNone(req => req.url.includes('/recipe-ingredient/'));
  });

  it('replaces the grid in one call and adopts the server cost', () => {
    component.editingRecipe = { id: 7 };
    component.ingredientRows = [{
      id: 0, inventory_id: 2, inventory_name: 'Paneer',
      quantity: '0.05', unit: 'kg', is_optional: false, is_prepped: false
    }];

    component.saveIngredients();

    const req = httpMock.expectOne(`${base}/api/v1/recipe-ingredient/7/replace`);
    expect(req.request.body.recipe_id).toBe(7);
    expect(req.request.body.ingredients).toEqual([{
      id: 0, inventory_id: 2, quantity: '0.05', unit: 'kg', is_optional: false, is_prepped: false
    }]);

    req.flush({
      status: true,
      message: 'Ingredients saved',
      data: {
        cost_price: '97.25',
        margin_percent: '59.48',
        ingredients: [{
          id: 11, inventory_id: 2, inventory_name: 'Paneer', quantity: '0.050',
          unit: 'kg', is_optional: false, is_prepped: false, line_cost: '97.25', in_stock: true
        }]
      }
    });

    expect(component.ingredientRows.length).toBe(1);
    expect(component.ingredientRows[0].id).toBe(11);
    expect(component.liveCostPrice).toBe('97.25');
    expect(component.liveMarginPercent).toBe('59.48');

    httpMock.expectOne(req2 =>
      req2.method === 'GET' && req2.url === `${base}/api/v1/recipe-ingredient/7/check-stock`
    ).flush({
      status: true,
      data: { recipe_id: 7, is_makeable: true, portions_available: 80, short_items: [] }
    });
    flushRecipes();

    expect(component.stockCheck?.portions_available).toBe(80);
  });

  //// ---- helpers ------------------------------------------------------

  it('bands margins for the list badges', () => {
    expect(component.marginClass({ margin_percent: '-1' })).toBe('m-loss');
    expect(component.marginClass({ margin_percent: '20' })).toBe('m-thin');
    expect(component.marginClass({ margin_percent: '40' })).toBe('m-ok');
    expect(component.marginClass({ margin_percent: '60' })).toBe('m-good');
  });

  it('labels known and unknown stations', () => {
    expect(component.stationLabel('tandoor')).toBe('Tandoor');
    expect(component.stationLabel('wok')).toBe('Wok');
    expect(component.stationLabel(null)).toBe('Other');
  });

  it('falls back to Uncategorised', () => {
    expect(component.categoryLabel({})).toBe('Uncategorised');
    expect(component.categoryLabel({ category_display_name: 'Starters' })).toBe('Starters');
  });

  it('numbers rows across pages', () => {
    expect(component.getSrNo(0)).toBe(1);

    component.onPaginateChange({ pageIndex: 1, pageSize: 10 });
    flushRecipes();

    expect(component.getSrNo(0)).toBe(11);
    expect(component.currentPageIndex).toBe(1);
  });

  //// ---- categories ---------------------------------------------------

  it('saves a category and reloads the filter list', () => {
    component.editingCategory = { id: 2 };
    component.categoryForm.patchValue({
      name: 'starters',
      display_name: 'Starters',
      description: 'Small plates',
      display_order: 1,
      is_active: true
    });
    const dialogRef = { close: jasmine.createSpy('close') };

    component.saveCategory(dialogRef);

    const req = httpMock.expectOne(`${base}/api/v1/recipe-category/upsert`);
    expect(req.request.body).toEqual({
      id: 2,
      name: 'starters',
      display_name: 'Starters',
      description: 'Small plates',
      display_order: 1,
      is_active: true,
      is_deleted: false
    });

    req.flush({ status: true, message: 'Category saved' });

    expect(dialogRef.close).toHaveBeenCalled();
    flushCategories();
  });
});
