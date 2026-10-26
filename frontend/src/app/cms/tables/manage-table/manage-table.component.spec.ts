import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SharedModule } from '../../../shared/shared.module';
import { AppConfig } from '../../../core/config/config';

import { ManageTableComponent } from './manage-table.component';

describe('ManageTableComponent', () => {
  const base = 'http://localhost:5000';

  async function setup(id?: string): Promise<{
    fixture: ComponentFixture<ManageTableComponent>;
    component: ManageTableComponent;
    httpMock: HttpTestingController;
    router: Router;
  }> {
    await TestBed.configureTestingModule({
      imports: [SharedModule, RouterTestingModule, NoopAnimationsModule],
      declarations: [ManageTableComponent],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap(id ? { id } : {}),
              data: { breadcrumb: id ? 'Edit Table' : 'Add Table' }
            }
          }
        }
      ],
    }).compileComponents();

    TestBed.inject(AppConfig).set('BASE_URL', base);
    const httpMock = TestBed.inject(HttpTestingController);
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(ManageTableComponent);
    fixture.detectChanges();

    return { fixture, component: fixture.componentInstance, httpMock, router };
  }

  describe('add mode', () => {
    let fixture: ComponentFixture<ManageTableComponent>;
    let component: ManageTableComponent;
    let httpMock: HttpTestingController;
    let router: Router;

    beforeEach(async () => {
      ({ fixture, component, httpMock, router } = await setup());
      httpMock.expectOne(req =>
        req.method === 'POST' && req.url === `${base}/api/v1/table-zone/get`
      ).flush({ status: true, data: [{ id: 1, name: 'indoor', display_name: 'Indoor' }] });
    });

    afterEach(() => {
      fixture.destroy();
      httpMock.verify();
    });

    it('starts with the same defaults as the old dialog', () => {
      expect(component.isEditMode).toBeFalse();
      expect(component.tableForm.value.capacity).toBe(2);
      expect(component.tableForm.value.shape).toBe('square');
      expect(component.tableForm.value.is_combinable).toBeTrue();
      expect(component.tableForm.value.is_active).toBeTrue();
      expect(component.zoneList.length).toBe(1);
    });

    it('rejects an invalid form without calling upsert', () => {
      component.tableForm.patchValue({ table_number: '', capacity: 0 });
      component.saveTable();
      httpMock.expectNone(`${base}/api/v1/table/upsert`);
    });

    it('saves a new table and returns to the list', () => {
      const nav = spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
      component.tableForm.patchValue({
        table_number: 'T3',
        table_name: 'Bar',
        capacity: 4,
        zone_id: 1,
        shape: 'round',
        is_combinable: false,
        is_active: true
      });
      component.saveTable();

      const req = httpMock.expectOne(`${base}/api/v1/table/upsert`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(jasmine.objectContaining({
        id: 0,
        table_number: 'T3',
        capacity: 4,
        zone_id: 1,
        shape: 'round',
        is_combinable: false,
        is_deleted: false
      }));
      req.flush({ status: true, message: 'Table saved successfully' });

      expect(nav).toHaveBeenCalledWith(['/cms/tables']);
    });

    it('returns to the list on cancel', () => {
      const nav = spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
      component.goBack();
      expect(nav).toHaveBeenCalledWith(['/cms/tables']);
    });
  });

  describe('edit mode', () => {
    let fixture: ComponentFixture<ManageTableComponent>;
    let component: ManageTableComponent;
    let httpMock: HttpTestingController;
    let router: Router;

    beforeEach(async () => {
      ({ fixture, component, httpMock, router } = await setup('10'));
      httpMock.expectOne(req =>
        req.method === 'POST' && req.url === `${base}/api/v1/table-zone/get`
      ).flush({ status: true, data: [{ id: 1, name: 'indoor', display_name: 'Indoor' }] });
      httpMock.expectOne(req =>
        req.method === 'GET' && req.url === `${base}/api/v1/table/get-by-id?id=10`
      ).flush({
        status: true,
        data: {
          id: 10,
          table_number: 'T1',
          table_name: 'Window',
          capacity: 4,
          zone_id: 1,
          shape: 'round',
          is_combinable: false,
          is_active: true,
          status: 'occupied'
        }
      });
    });

    afterEach(() => {
      fixture.destroy();
      httpMock.verify();
    });

    it('loads the table into the form', () => {
      expect(component.isEditMode).toBeTrue();
      expect(component.editingTable?.id).toBe(10);
      expect(component.tableForm.value.table_number).toBe('T1');
      expect(component.tableForm.value.capacity).toBe(4);
      expect(component.tableForm.value.zone_id).toBe(1);
      expect(component.tableForm.value.shape).toBe('round');
    });

    it('submits the existing id on update', () => {
      const nav = spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
      component.tableForm.patchValue({ table_name: 'Window 4' });
      component.saveTable();

      const req = httpMock.expectOne(`${base}/api/v1/table/upsert`);
      expect(req.request.body.id).toBe(10);
      expect(req.request.body.table_name).toBe('Window 4');
      req.flush({ status: true, message: 'Table saved successfully' });

      expect(nav).toHaveBeenCalledWith(['/cms/tables']);
    });
  });
});
