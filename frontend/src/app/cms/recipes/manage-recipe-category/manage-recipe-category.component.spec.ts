import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { SharedModule } from '../../../shared/shared.module';
import { AppConfig } from '../../../core/config/config';

import { ManageRecipeCategoryComponent } from './manage-recipe-category.component';

describe('ManageRecipeCategoryComponent', () => {
  const base = 'http://localhost:5000';
  const upsertUrl = `${base}/api/v1/recipe-category/upsert`;

  async function setup(id?: string): Promise<{
    fixture: ComponentFixture<ManageRecipeCategoryComponent>;
    component: ManageRecipeCategoryComponent;
    httpMock: HttpTestingController;
    router: Router;
  }> {
    await TestBed.configureTestingModule({
      imports: [SharedModule, RouterTestingModule, NoopAnimationsModule],
      declarations: [ManageRecipeCategoryComponent],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap(id ? { id } : {}),
              data: { breadcrumb: id ? 'Edit Category' : 'Add Category' }
            }
          }
        }
      ]
    }).compileComponents();

    TestBed.inject(AppConfig).set('BASE_URL', base);
    const httpMock = TestBed.inject(HttpTestingController);
    const router = TestBed.inject(Router);

    const fixture = TestBed.createComponent(ManageRecipeCategoryComponent);
    fixture.detectChanges();

    return { fixture, component: fixture.componentInstance, httpMock, router };
  }

  describe('add mode', () => {
    let fixture: ComponentFixture<ManageRecipeCategoryComponent>;
    let component: ManageRecipeCategoryComponent;
    let httpMock: HttpTestingController;
    let router: Router;

    beforeEach(async () => {
      ({ fixture, component, httpMock, router } = await setup());
    });

    afterEach(() => {
      fixture.destroy();
      httpMock.verify();
    });

    it('starts empty and active', () => {
      expect(component.isEditMode).toBeFalse();
      expect(component.categoryForm.value.is_active).toBeTrue();
      expect(component.categoryForm.value.display_order).toBe(0);
    });

    it('rejects an invalid form without calling upsert', () => {
      component.categoryForm.patchValue({ name: '', display_name: '' });
      component.saveCategory();

      httpMock.expectNone(upsertUrl);
    });

    it('creates the category and returns to the categories tab', () => {
      const nav = spyOn(router, 'navigate').and.resolveTo(true);
      component.categoryForm.patchValue({
        name: ' starters ',
        display_name: 'Starters',
        description: 'Small plates',
        display_order: 1,
        is_active: true
      });

      component.saveCategory();

      const req = httpMock.expectOne(upsertUrl);
      expect(req.request.body).toEqual({
        id: 0,
        name: 'starters',
        display_name: 'Starters',
        description: 'Small plates',
        display_order: 1,
        is_active: true,
        is_deleted: false
      });

      req.flush({ status: true, message: 'Category created' });

      expect(nav).toHaveBeenCalledWith(['/cms/recipes'], { queryParams: { tab: 'categories' } });
    });

    it('returns to the categories tab on cancel', () => {
      const nav = spyOn(router, 'navigate').and.resolveTo(true);

      component.goBack();

      expect(nav).toHaveBeenCalledWith(['/cms/recipes'], { queryParams: { tab: 'categories' } });
    });
  });

  describe('edit mode', () => {
    let fixture: ComponentFixture<ManageRecipeCategoryComponent>;
    let component: ManageRecipeCategoryComponent;
    let httpMock: HttpTestingController;
    let router: Router;

    beforeEach(async () => {
      ({ fixture, component, httpMock, router } = await setup('2'));

      httpMock.expectOne(req =>
        req.method === 'GET' && req.url === `${base}/api/v1/recipe-category/get-by-id?id=2`
      ).flush({
        status: true,
        data: {
          id: 2,
          name: 'starters',
          display_name: 'Starters',
          description: 'Small plates',
          display_order: 1,
          is_active: true,
          recipe_count: 4,
          available_recipe_count: 3
        }
      });
    });

    afterEach(() => {
      fixture.destroy();
      httpMock.verify();
    });

    it('loads the category into the form', () => {
      expect(component.isEditMode).toBeTrue();
      expect(component.editingCategory?.id).toBe(2);
      expect(component.editingCategory?.recipe_count).toBe(4);
      expect(component.categoryForm.value.name).toBe('starters');
      expect(component.categoryForm.value.display_order).toBe(1);
    });

    it('submits the existing id and returns to the list', () => {
      const nav = spyOn(router, 'navigate').and.resolveTo(true);
      component.categoryForm.patchValue({ display_name: 'Starters & Snacks' });

      component.saveCategory();

      const req = httpMock.expectOne(upsertUrl);
      expect(req.request.body.id).toBe(2);
      expect(req.request.body.display_name).toBe('Starters & Snacks');
      req.flush({ status: true, message: 'Category saved' });

      expect(nav).toHaveBeenCalledWith(['/cms/recipes'], { queryParams: { tab: 'categories' } });
    });
  });
});
