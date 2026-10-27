import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
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
  let router: Router;

  /// The list only reads `tab` off the route; a stub keeps the spec from
  /// having to build a routed shell just to open the categories tab.
  let queryTab: string | null = null;
  const routeStub = {
    snapshot: { queryParamMap: { get: (key: string) => (key === 'tab' ? queryTab : null) } }
  };

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
    queryTab = null;

    await TestBed.configureTestingModule({
      imports: [SharedModule, RouterTestingModule, NoopAnimationsModule],
      declarations: [RecipeListComponent],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: routeStub },
        { provide: CustomSnackbarService, useClass: MockSnackbarService }
      ]
    }).compileComponents();

    TestBed.inject(AppConfig).set('BASE_URL', base);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
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
    expect(component.totalPages).toBe(1);
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

  //// ---- navigation ---------------------------------------------------

  it('keeps the active tab in the query string', () => {
    component.onTabChange(1);

    expect(component.selectedTabIndex).toBe(1);
    expect(router.navigate).toHaveBeenCalledWith([], {
      relativeTo: routeStub as unknown as ActivatedRoute,
      queryParams: { tab: 'categories' },
      replaceUrl: true
    });

    component.onTabChange(0);

    expect(router.navigate).toHaveBeenCalledWith([], {
      relativeTo: routeStub as unknown as ActivatedRoute,
      queryParams: {},
      replaceUrl: true
    });
  });

  it('opens the categories tab when the url asks for it', () => {
    queryTab = 'categories';

    component.ngOnInit();
    flushInit();

    expect(component.selectedTabIndex).toBe(1);
  });

  it('navigates to the add-recipe page', () => {
    component.onAddRecipe();

    expect(router.navigate).toHaveBeenCalledWith(['/cms/recipes/add-recipe']);
  });

  it('navigates to the edit-recipe page with the id', () => {
    component.onEditRecipe(recipeRows[0]);

    expect(router.navigate).toHaveBeenCalledWith(['/cms/recipes/update-recipe', 1]);
  });

  it('ignores a recipe with no id', () => {
    component.onEditRecipe({ name: 'draft' });

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('navigates to the add-category and edit-category pages', () => {
    component.onAddCategory();
    expect(router.navigate).toHaveBeenCalledWith(['/cms/recipes/add-category']);

    component.onEditCategory({ id: 2, name: 'starters' });
    expect(router.navigate).toHaveBeenCalledWith(['/cms/recipes/update-category', 2]);
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
    flushRecipes({ status: true, data: recipeRows.map(r => ({ ...r })), meta: { total_records: 25 } });

    expect(component.getSrNo(0)).toBe(11);
    expect(component.currentPageIndex).toBe(1);
    expect(component.currentPage).toBe(2);
    expect(component.totalPages).toBe(3);
  });
});
