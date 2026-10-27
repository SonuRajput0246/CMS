import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SharedModule } from '../../../shared/shared.module';
import { AppConfig } from '../../../core/config/config';

import { ManageCustomerComponent } from './manage-customer.component';

describe('ManageCustomerComponent', () => {
  const base = 'http://localhost:5000';

  async function setup(id?: string): Promise<{
    fixture: ComponentFixture<ManageCustomerComponent>;
    component: ManageCustomerComponent;
    httpMock: HttpTestingController;
    router: Router;
  }> {
    await TestBed.configureTestingModule({
      imports: [SharedModule, RouterTestingModule, NoopAnimationsModule],
      declarations: [ManageCustomerComponent],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap(id ? { id } : {}),
              data: { breadcrumb: id ? 'Edit Customer' : 'Add Customer' }
            }
          }
        }
      ],
    }).compileComponents();

    TestBed.inject(AppConfig).set('BASE_URL', base);
    const httpMock = TestBed.inject(HttpTestingController);
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(ManageCustomerComponent);
    fixture.detectChanges();

    return { fixture, component: fixture.componentInstance, httpMock, router };
  }

  describe('add mode', () => {
    let fixture: ComponentFixture<ManageCustomerComponent>;
    let component: ManageCustomerComponent;
    let httpMock: HttpTestingController;
    let router: Router;

    beforeEach(async () => {
      ({ fixture, component, httpMock, router } = await setup());
    });

    afterEach(() => {
      fixture.destroy();
      httpMock.verify();
    });

    it('starts with the same defaults as the old dialog', () => {
      expect(component.isEditMode).toBeFalse();
      expect(component.customerForm.value.is_vip).toBeFalse();
      expect(component.customerForm.value.is_active).toBeTrue();
    });

    it('rejects an invalid form without calling upsert', () => {
      component.customerForm.patchValue({ name: '', phone: '123' });

      component.saveCustomer();

      httpMock.expectNone(`${base}/api/v1/customer/upsert`);
    });

    it('saves a new customer and returns to the list', () => {
      const nav = spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
      component.customerForm.patchValue({
        name: '  John Doe ',
        phone: ' 9876543210 ',
        email: '',
        address: '',
        dietary_notes: null,
        is_vip: true,
        is_active: true
      });

      component.saveCustomer();

      const req = httpMock.expectOne(`${base}/api/v1/customer/upsert`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(jasmine.objectContaining({
        id: 0,
        name: 'John Doe',
        phone: '9876543210',
        email: null,
        address: null,
        dietary_notes: null,
        is_vip: true,
        is_active: true,
        is_deleted: false
      }));
      req.flush({ status: true, message: 'Customer created' });

      expect(nav).toHaveBeenCalledWith(['/cms/customers']);
    });

    it('keeps the form open when the API refuses the save', () => {
      const nav = spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
      component.customerForm.patchValue({
        name: 'John Doe',
        phone: '1234567890',
        is_active: true
      });

      component.saveCustomer();

      httpMock.expectOne(`${base}/api/v1/customer/upsert`).flush(
        { status: false, message: 'Invalid phone number format' },
        { status: 400, statusText: 'Bad Request' }
      );

      expect(nav).not.toHaveBeenCalled();
      expect(component.isSaving).toBeFalse();
    });

    it('returns to the list on cancel', () => {
      const nav = spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

      component.goBack();

      expect(nav).toHaveBeenCalledWith(['/cms/customers']);
    });
  });

  describe('edit mode', () => {
    let fixture: ComponentFixture<ManageCustomerComponent>;
    let component: ManageCustomerComponent;
    let httpMock: HttpTestingController;
    let router: Router;

    beforeEach(async () => {
      ({ fixture, component, httpMock, router } = await setup('10'));
      httpMock.expectOne(req =>
        req.method === 'GET' && req.url === `${base}/api/v1/customer/get-by-id?id=10`
      ).flush({
        status: true,
        data: {
          id: 10,
          customer_code: 'CUST010',
          name: 'John Doe',
          phone: '9876543210',
          email: 'john@example.com',
          address: '1 Main Road',
          dietary_notes: null,
          tier: 'GOLD',
          loyalty_points: 1500,
          is_vip: true,
          is_active: true
        }
      });
    });

    afterEach(() => {
      fixture.destroy();
      httpMock.verify();
    });

    it('loads the customer into the form', () => {
      expect(component.isEditMode).toBeTrue();
      expect(component.editingCustomer?.id).toBe(10);
      expect(component.customerForm.value.name).toBe('John Doe');
      expect(component.customerForm.value.phone).toBe('9876543210');
      expect(component.customerForm.value.email).toBe('john@example.com');
      expect(component.customerForm.value.is_vip).toBeTrue();
    });

    it('submits the existing id on update', () => {
      const nav = spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
      component.customerForm.patchValue({ name: 'John Dae' });

      component.saveCustomer();

      const req = httpMock.expectOne(`${base}/api/v1/customer/upsert`);
      expect(req.request.body.id).toBe(10);
      expect(req.request.body.name).toBe('John Dae');
      req.flush({ status: true, message: 'Customer updated' });

      expect(nav).toHaveBeenCalledWith(['/cms/customers']);
    });
  });

  describe('missing customer', () => {
    let fixture: ComponentFixture<ManageCustomerComponent>;
    let httpMock: HttpTestingController;

    beforeEach(async () => {
      ({ fixture, httpMock } = await setup('99'));
    });

    afterEach(() => {
      fixture.destroy();
      httpMock.verify();
    });

    it('stays in add mode when the record is gone', () => {
      httpMock.expectOne(req =>
        req.method === 'GET' && req.url === `${base}/api/v1/customer/get-by-id?id=99`
      ).flush(
        { status: false, message: 'Customer not found' },
        { status: 404, statusText: 'Not Found' }
      );

      expect(fixture.componentInstance.isEditMode).toBeFalse();
      expect(fixture.componentInstance.editingCustomer).toBeNull();
    });
  });
});
