import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { SharedModule } from '../../../shared/shared.module';
import { AppConfig } from '../../../core/config/config';
import { CustomSnackbarService } from '../../../shared/custom-snackbar/custom-snackbar.service';

import { ManageRecipeComponent } from './manage-recipe.component';

class MockSnackbarService {
  openSnackBar = jasmine.createSpy('openSnackBar');
}

describe('ManageRecipeComponent', () => {
  const base = 'http://localhost:5000';
  const categoriesUrl = `${base}/api/v1/recipe-category/get`;
  const stationsUrl = `${base}/api/v1/recipe/get-stations`;
  const inventoryUrl = `${base}/api/v1/inventory/get`;

  async function setup(id?: string): Promise<{
    fixture: ComponentFixture<ManageRecipeComponent>;
    component: ManageRecipeComponent;
    httpMock: HttpTestingController;
    router: Router;
    location: Location;
  }> {
    await TestBed.configureTestingModule({
      imports: [SharedModule, RouterTestingModule, NoopAnimationsModule],
      declarations: [ManageRecipeComponent],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: Location, useValue: { replaceState: jasmine.createSpy('replaceState') } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap(id ? { id } : {}),
              data: { breadcrumb: id ? 'Edit Recipe' : 'Add Recipe' }
            }
          }
        },
        { provide: CustomSnackbarService, useClass: MockSnackbarService }
      ]
    }).compileComponents();

    TestBed.inject(AppConfig).set('BASE_URL', base);
    const httpMock = TestBed.inject(HttpTestingController);
    const router = TestBed.inject(Router);
    const location = TestBed.inject(Location);

    const fixture = TestBed.createComponent(ManageRecipeComponent);
    fixture.detectChanges();

    return { fixture, component: fixture.componentInstance, httpMock, router, location };
  }

  function flushCategories(httpMock: HttpTestingController): void {
    httpMock.expectOne(req => req.method === 'POST' && req.url === categoriesUrl).flush({
      status: true,
      data: [{ id: 2, name: 'starters', display_name: 'Starters' }]
    });
  }

  function flushStations(httpMock: HttpTestingController): void {
    httpMock.expectOne(req => req.method === 'GET' && req.url === stationsUrl).flush({
      status: true,
      data: ['grill', 'fry', 'tandoor', 'other']
    });
  }

  function flushInventory(httpMock: HttpTestingController): void {
    httpMock.expectOne(req => req.method === 'POST' && req.url === inventoryUrl).flush({
      status: true,
      data: [{ id: 2, name: 'Paneer', unit: 'kg' }]
    });
  }

  describe('add mode', () => {
    let fixture: ComponentFixture<ManageRecipeComponent>;
    let component: ManageRecipeComponent;
    let httpMock: HttpTestingController;
    let router: Router;
    let location: Location;

    beforeEach(async () => {
      ({ fixture, component, httpMock, router, location } = await setup());
      flushCategories(httpMock);
      flushStations(httpMock);
    });

    afterEach(() => {
      fixture.destroy();
      httpMock.verify();
    });

    it('starts with the schema-compatible defaults', () => {
      expect(component.isEditMode).toBeFalse();
      expect(component.editingRecipe).toBeNull();
      expect(component.recipeForm.value.station).toBe('other');
      expect(component.recipeForm.value.is_available).toBeTrue();
      expect(component.recipeForm.value.is_active).toBeTrue();
      expect(component.categoryList.length).toBe(1);
    });

    it('rejects an invalid form without calling upsert', () => {
      component.recipeForm.patchValue({ name: '', display_name: '', selling_price: null });
      component.saveRecipe();

      expect(component.recipeForm.invalid).toBeTrue();
      httpMock.expectNone(`${base}/api/v1/recipe/upsert`);
    });

    it('creates the recipe without a client-side cost_price', () => {
      component.recipeForm.patchValue({
        name: ' paneer_tikka ',
        display_name: 'Paneer Tikka',
        category_id: 2,
        selling_price: 240,
        station: 'tandoor',
        is_vegetarian: true,
        is_available: true,
        is_active: true
      });

      component.saveRecipe();

      const req = httpMock.expectOne(`${base}/api/v1/recipe/upsert`);
      const body = req.request.body;
      expect(body.id).toBe(0);
      expect(body.name).toBe('paneer_tikka');
      expect(body.selling_price).toBe(240);
      expect(body.is_deleted).toBeFalse();
      expect(body.cost_price).toBeUndefined();

      req.flush({ status: true, message: 'Recipe created', data: { id: 5, name: 'paneer_tikka' } });

      // The page stays open so ingredient lines can be added against the new id.
      expect(component.isEditMode).toBeTrue();
      expect(component.editingRecipe?.id).toBe(5);
      expect(location.replaceState).toHaveBeenCalledWith('/cms/recipes/update-recipe/5');

      flushInventory(httpMock);
    });

    it('ticks vegetarian when vegan is selected', () => {
      component.recipeForm.get('is_vegan')?.setValue(true);

      expect(component.recipeForm.get('is_vegetarian')?.value).toBeTrue();
      expect(component.veganNeedsVegetarian).toBeFalse();
    });

    it('refuses to save ingredients before the recipe exists', () => {
      component.ingredientRows = [{
        id: 0, inventory_id: 2, inventory_name: 'Paneer',
        quantity: '1', unit: 'kg', is_optional: false, is_prepped: false
      }];

      component.saveIngredients();

      httpMock.expectNone(req => req.url.includes('/recipe-ingredient/'));
    });

    it('returns to the menu on cancel', () => {
      const nav = spyOn(router, 'navigate').and.resolveTo(true);

      component.goBack();

      expect(nav).toHaveBeenCalledWith(['/cms/recipes']);
    });
  });

  describe('edit mode', () => {
    let fixture: ComponentFixture<ManageRecipeComponent>;
    let component: ManageRecipeComponent;
    let httpMock: HttpTestingController;
    let router: Router;

    beforeEach(async () => {
      ({ fixture, component, httpMock, router } = await setup('7'));
      flushCategories(httpMock);
      flushStations(httpMock);

      httpMock.expectOne(req =>
        req.method === 'GET' && req.url === `${base}/api/v1/recipe/get-by-id?id=7`
      ).flush({
        status: true,
        data: {
          id: 7,
          recipe_code: 'RCP-007',
          name: 'house_burger',
          display_name: 'House Burger',
          category_id: 2,
          selling_price: '180.00',
          cost_price: '140.00',
          margin_percent: '22.22',
          station: 'grill',
          is_available: false,
          is_active: true,
          ingredients: [{
            id: 11, inventory_id: 2, inventory_name: 'Paneer', quantity: '0.05000000074505806',
            unit: 'kg', is_optional: false, is_prepped: false, line_cost: '20.00', in_stock: true
          }]
        }
      });

      flushInventory(httpMock);
      httpMock.expectOne(req =>
        req.method === 'GET' && req.url === `${base}/api/v1/recipe-ingredient/7/check-stock`
      ).flush({
        status: true,
        data: { recipe_id: 7, is_makeable: true, portions_available: 12, short_items: [] }
      });
    });

    afterEach(() => {
      fixture.destroy();
      httpMock.verify();
    });

    it('loads the recipe, its lines and the stock check', () => {
      expect(component.isEditMode).toBeTrue();
      expect(component.recipeForm.value.name).toBe('house_burger');
      expect(component.recipeForm.value.station).toBe('grill');
      expect(component.recipeForm.value.is_available).toBeFalse();
      expect(component.ingredientRows.length).toBe(1);
      expect(component.ingredientRows[0].id).toBe(11);
      // SQLite returns the Decimal column as a float; the grid shows the 3dp value.
      expect(component.ingredientRows[0].quantity).toBe('0.05');
      expect(component.liveCostPrice).toBe('140.00');
      expect(component.stockCheck?.portions_available).toBe(12);
    });

    it('submits the existing id and never a cost_price', () => {
      component.recipeForm.patchValue({ display_name: 'House Burger Deluxe' });
      component.saveRecipe();

      const req = httpMock.expectOne(`${base}/api/v1/recipe/upsert`);
      expect(req.request.body.id).toBe(7);
      expect(req.request.body.display_name).toBe('House Burger Deluxe');
      expect(req.request.body.cost_price).toBeUndefined();
      req.flush({ status: true, message: 'Recipe saved' });
    });

    it('refuses a row with no item before hitting the service', () => {
      component.ingredientRows = [{
        id: 0, inventory_id: null, inventory_name: null,
        quantity: '1', unit: 'pcs', is_optional: false, is_prepped: false
      }];

      component.saveIngredients();

      httpMock.expectNone(req => req.url.includes('/recipe-ingredient/'));
    });

    it('refuses duplicate inventory rows before hitting the schema', () => {
      component.ingredientRows = [
        { id: 0, inventory_id: 2, inventory_name: 'Paneer', quantity: '1', unit: 'kg', is_optional: false, is_prepped: false },
        { id: 0, inventory_id: 2, inventory_name: 'Paneer', quantity: '2', unit: 'kg', is_optional: false, is_prepped: false }
      ];

      component.saveIngredients();

      httpMock.expectNone(req => req.url.includes('/recipe-ingredient/'));
    });

    it('replaces the grid in one call and adopts the server cost', () => {
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

      expect(component.stockCheck?.portions_available).toBe(80);
    });

    it('returns to the menu after cancel', () => {
      const nav = spyOn(router, 'navigate').and.resolveTo(true);

      component.goBack();

      expect(nav).toHaveBeenCalledWith(['/cms/recipes']);
    });
  });
});
