import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SharedModule } from '../../../shared/shared.module';
import { AppConfig } from '../../../core/config/config';

import { ManageZoneComponent } from './manage-zone.component';

describe('ManageZoneComponent', () => {
  const base = 'http://localhost:5000';

  async function setup(id?: string): Promise<{
    fixture: ComponentFixture<ManageZoneComponent>;
    component: ManageZoneComponent;
    httpMock: HttpTestingController;
    router: Router;
  }> {
    await TestBed.configureTestingModule({
      imports: [SharedModule, RouterTestingModule, NoopAnimationsModule],
      declarations: [ManageZoneComponent],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap(id ? { id } : {}),
              data: { breadcrumb: id ? 'Edit Zone' : 'Add Zone' }
            }
          }
        }
      ],
    }).compileComponents();

    TestBed.inject(AppConfig).set('BASE_URL', base);
    const httpMock = TestBed.inject(HttpTestingController);
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(ManageZoneComponent);
    fixture.detectChanges();

    return { fixture, component: fixture.componentInstance, httpMock, router };
  }

  describe('add mode', () => {
    let fixture: ComponentFixture<ManageZoneComponent>;
    let component: ManageZoneComponent;
    let httpMock: HttpTestingController;
    let router: Router;

    beforeEach(async () => {
      ({ fixture, component, httpMock, router } = await setup());
      httpMock.expectOne(req =>
        req.method === 'POST' && req.url === `${base}/api/v1/table-zone/get`
      ).flush({
        status: true,
        data: [
          { id: 1, name: 'indoor', display_name: 'Indoor', display_order: 1 },
          { id: 2, name: 'patio', display_name: 'Patio', display_order: 2 }
        ]
      });
    });

    afterEach(() => {
      fixture.destroy();
      httpMock.verify();
    });

    it('prefills the display order after the last zone', () => {
      expect(component.isEditMode).toBeFalse();
      expect(component.zoneForm.value.display_order).toBe(3);
      expect(component.zoneForm.value.is_active).toBeTrue();
    });

    it('rejects an invalid form without calling upsert', () => {
      component.zoneForm.patchValue({ name: '', display_name: '' });
      component.saveZone();
      httpMock.expectNone(`${base}/api/v1/table-zone/upsert`);
    });

    it('saves a new zone and returns to the zones tab', () => {
      const nav = spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
      component.zoneForm.patchValue({
        name: 'bar',
        display_name: 'Bar',
        description: 'Drinks counter',
        display_order: 2,
        is_active: true
      });
      component.saveZone();

      const req = httpMock.expectOne(`${base}/api/v1/table-zone/upsert`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(jasmine.objectContaining({
        id: 0,
        name: 'bar',
        display_name: 'Bar',
        description: 'Drinks counter',
        is_deleted: false
      }));
      req.flush({ status: true, message: 'Zone saved successfully' });

      expect(nav).toHaveBeenCalledWith(['/cms/tables'], { queryParams: { tab: 'zones' } });
    });

    it('returns to the zones tab on cancel', () => {
      const nav = spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
      component.goBack();
      expect(nav).toHaveBeenCalledWith(['/cms/tables'], { queryParams: { tab: 'zones' } });
    });
  });

  describe('edit mode', () => {
    let fixture: ComponentFixture<ManageZoneComponent>;
    let component: ManageZoneComponent;
    let httpMock: HttpTestingController;
    let router: Router;

    beforeEach(async () => {
      ({ fixture, component, httpMock, router } = await setup('2'));
      httpMock.expectOne(req =>
        req.method === 'GET' && req.url === `${base}/api/v1/table-zone/get-by-id?id=2`
      ).flush({
        status: true,
        data: {
          id: 2,
          name: 'patio',
          display_name: 'Garden Patio',
          description: 'Outdoors',
          display_order: 3,
          is_active: false
        }
      });
    });

    afterEach(() => {
      fixture.destroy();
      httpMock.verify();
    });

    it('loads the zone into the form', () => {
      expect(component.isEditMode).toBeTrue();
      expect(component.editingZone?.id).toBe(2);
      expect(component.zoneForm.value.name).toBe('patio');
      expect(component.zoneForm.value.display_order).toBe(3);
      expect(component.zoneForm.value.is_active).toBeFalse();
    });

    it('submits the existing id on update', () => {
      const nav = spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
      component.zoneForm.patchValue({ display_name: 'Patio' });
      component.saveZone();

      const req = httpMock.expectOne(`${base}/api/v1/table-zone/upsert`);
      expect(req.request.body.id).toBe(2);
      expect(req.request.body.display_name).toBe('Patio');
      expect(req.request.body.is_active).toBeFalse();
      req.flush({ status: true, message: 'Zone saved successfully' });

      expect(nav).toHaveBeenCalledWith(['/cms/tables'], { queryParams: { tab: 'zones' } });
    });
  });
});
