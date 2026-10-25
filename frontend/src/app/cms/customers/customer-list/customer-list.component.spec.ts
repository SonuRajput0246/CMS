import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SharedModule } from '../../../shared/shared.module';
import { AppConfig } from '../../../core/config/config';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { provideNativeDateAdapter } from '@angular/material/core';
import { of } from 'rxjs';

import { CustomSnackbarService } from '../../../shared/custom-snackbar/custom-snackbar.service';
import { ConfirmationService } from '../../../services/confirmation.service';
import {
  CustomerListComponent,
  CustomerFormDialogComponent,
  CustomerRedeemDialogComponent
} from './customer-list.component';

class MockSnackbarService {
  openSnackBar = jasmine.createSpy('openSnackBar');
}

const base = 'http://localhost:5000';

const CUSTOMERS = [
  {
    id: 1, customer_code: 'CUST001', name: 'John Doe', phone: '9876543210',
    email: 'john@example.com', address: '1 Main Road', dietary_notes: null,
    tier: 'GOLD', loyalty_points: 1500, total_visits: 12, total_spent: '12500.00',
    last_visit_at: '2026-10-20T10:00:00Z', is_vip: true, is_active: true
  },
  {
    id: 2, customer_code: 'CUST002', name: 'Jane Smith', phone: '9876543211',
    email: 'jane@example.com', address: null, dietary_notes: 'Vegetarian',
    tier: 'REGULAR', loyalty_points: 200, total_visits: 3, total_spent: '1800.00',
    last_visit_at: '2026-10-15T14:00:00Z', is_vip: false, is_active: true
  }
];

describe('CustomerListComponent', () => {
  let component: CustomerListComponent;
  let fixture: ComponentFixture<CustomerListComponent>;
  let httpMock: HttpTestingController;
  let dialog: MatDialog;
  let confirmation: ConfirmationService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SharedModule, RouterTestingModule, NoopAnimationsModule],
      declarations: [
        CustomerListComponent,
        CustomerFormDialogComponent,
        CustomerRedeemDialogComponent
      ],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        provideNativeDateAdapter(),
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close') } },
        { provide: MAT_DIALOG_DATA, useValue: {} },
        { provide: CustomSnackbarService, useClass: MockSnackbarService },
      ],
    })
    .compileComponents();

    TestBed.inject(AppConfig).set('BASE_URL', base);
    httpMock = TestBed.inject(HttpTestingController);
    dialog = TestBed.inject(MatDialog);
    confirmation = TestBed.inject(ConfirmationService);

    fixture = TestBed.createComponent(CustomerListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/customer/get`
    ).flush({
      status: true,
      data: CUSTOMERS,
      meta: { total_records: 2 },
    });

    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads customers on init', () => {
    expect(component.customerList.length).toBe(2);
    expect(component.pageDet.total_docs).toBe(2);
  });

  it('applies search filter with 3+ chars', () => {
    component.searchValue = 'John';
    component.applyFilter();

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/customer/get` &&
      req.body.search_value === 'John'
    ).flush({ status: true, data: [], meta: { total_records: 0 } });
  });

  it('does not apply search filter with < 3 chars', () => {
    component.searchValue = 'Jo';
    component.applyFilter();

    httpMock.expectNone(`${base}/api/v1/customer/get`);
  });

  it('clears all filters, including VIP', () => {
    component.searchValue = 'John';
    component.isVipFilter = true;
    component.clearFilter();

    expect(component.searchValue).toBe('');
    expect(component.isVipFilter).toBeNull();

    const req = httpMock.expectOne(r => r.method === 'POST' && r.url === `${base}/api/v1/customer/get`);
    expect(req.request.body.is_vip).toBeNull();
    req.flush({ status: true, data: [], meta: { total_records: 0 } });
  });

  it('filters by VIP status', () => {
    component.isVipFilter = true;
    component.onVipFilterChange();

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/customer/get` &&
      req.body.is_vip === true
    ).flush({ status: true, data: [], meta: { total_records: 0 } });
  });

  it('opens edit dialog', () => {
    const customer = component.customerList[0];
    spyOn(dialog, 'open').and.returnValue({
      afterClosed: () => of(true)
    } as any);

    component.onEdit(customer);

    expect(dialog.open).toHaveBeenCalledWith(
      CustomerFormDialogComponent,
      jasmine.objectContaining({ data: { customer, isEdit: true } })
    );
    httpMock.expectOne(`${base}/api/v1/customer/get`).flush({
      status: true, data: [], meta: { total_records: 0 }
    });
  });

  it('opens add customer dialog', () => {
    spyOn(dialog, 'open').and.returnValue({
      afterClosed: () => of(true)
    } as any);

    component.onAddCustomer();

    expect(dialog.open).toHaveBeenCalledWith(
      CustomerFormDialogComponent,
      jasmine.objectContaining({ data: { isEdit: false } })
    );
    httpMock.expectOne(`${base}/api/v1/customer/get`).flush({
      status: true, data: [], meta: { total_records: 0 }
    });
  });

  it('opens redeem points dialog', () => {
    const customer = component.customerList[0];
    spyOn(dialog, 'open').and.returnValue({
      afterClosed: () => of(false)
    } as any);

    component.onRedeemPoints(customer);

    expect(dialog.open).toHaveBeenCalledWith(
      CustomerRedeemDialogComponent,
      jasmine.objectContaining({ data: { customer } })
    );
  });

  it('deletes a customer with confirmation', fakeAsync(() => {
    const customer = component.customerList[0];
    spyOn(confirmation, 'confirmDelete').and.resolveTo({
      isConfirmed: true, isDenied: false, isDismissed: false
    } as any);

    component.onDelete(customer);
    tick();

    const deleteReq = httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/customer/upsert` &&
      req.body.is_deleted === true
    );
    expect(deleteReq.request.body.id).toBe(1);
    deleteReq.flush({ status: true, message: 'Customer deleted' });

    httpMock.expectOne(`${base}/api/v1/customer/get`).flush({
      status: true, data: [], meta: { total_records: 0 }
    });
  }));

  it('does not delete when confirmation is declined', fakeAsync(() => {
    const customer = component.customerList[0];
    spyOn(confirmation, 'confirmDelete').and.resolveTo({
      isConfirmed: false, isDenied: false, isDismissed: true
    } as any);

    component.onDelete(customer);
    tick();

    httpMock.expectNone(`${base}/api/v1/customer/upsert`);
  }));

  it('labels tier correctly', () => {
    expect(component.getTierLabel('GOLD')).toBe('GOLD');
    expect(component.getTierLabel('')).toBe('REGULAR');
  });

  it('returns correct tier class', () => {
    expect(component.getTierClass('PLATINUM')).toBe('tier-platinum');
    expect(component.getTierClass('GOLD')).toBe('tier-gold');
    expect(component.getTierClass('SILVER')).toBe('tier-silver');
    expect(component.getTierClass('REGULAR')).toBe('tier-regular');
    expect(component.getTierClass('UNKNOWN')).toBe('tier-regular');
  });
});

describe('CustomerFormDialogComponent', () => {
  let component: CustomerFormDialogComponent;
  let fixture: ComponentFixture<CustomerFormDialogComponent>;
  let httpMock: HttpTestingController;
  let snackbar: MockSnackbarService;
  let dialogRef: MatDialogRef<CustomerFormDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SharedModule, RouterTestingModule, NoopAnimationsModule],
      declarations: [CustomerFormDialogComponent],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        provideNativeDateAdapter(),
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close') } },
        { provide: MAT_DIALOG_DATA, useValue: { isEdit: false } },
        { provide: CustomSnackbarService, useClass: MockSnackbarService },
      ],
    })
    .compileComponents();

    TestBed.inject(AppConfig).set('BASE_URL', base);
    httpMock = TestBed.inject(HttpTestingController);
    snackbar = TestBed.inject(CustomSnackbarService) as unknown as MockSnackbarService;
    dialogRef = TestBed.inject(MatDialogRef);

    fixture = TestBed.createComponent(CustomerFormDialogComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    httpMock.verify();
  });

  it('rejects a blank name or phone without calling the API', () => {
    component.formData = { name: '  ', phone: '', is_active: true };

    component.onSubmit();

    expect(snackbar.openSnackBar).toHaveBeenCalledWith('Name and phone are required', 'error');
    httpMock.expectNone(`${base}/api/v1/customer/upsert`);
  });

  it('trims required fields and sends blank optionals as null', () => {
    component.formData = {
      name: '  John Doe ',
      phone: ' 9876543210 ',
      email: ' ',
      address: '',
      dietary_notes: null,
      is_vip: true,
      is_active: true
    };

    component.onSubmit();

    const req = httpMock.expectOne(`${base}/api/v1/customer/upsert`);
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
    req.flush({ status: true, message: 'Customer created', data: {} });

    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('surfaces the API validation message when saving fails', () => {
    component.formData = { name: 'John Doe', phone: '123', is_active: true };

    component.onSubmit();

    httpMock.expectOne(`${base}/api/v1/customer/upsert`).flush(
      { status: false, message: 'Invalid phone number format' },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(snackbar.openSnackBar).toHaveBeenCalledWith('Invalid phone number format', 'error');
  });
});

describe('CustomerRedeemDialogComponent', () => {
  let component: CustomerRedeemDialogComponent;
  let fixture: ComponentFixture<CustomerRedeemDialogComponent>;
  let httpMock: HttpTestingController;
  let snackbar: MockSnackbarService;
  let dialogRef: MatDialogRef<CustomerRedeemDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SharedModule, RouterTestingModule, NoopAnimationsModule],
      declarations: [CustomerRedeemDialogComponent],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        provideNativeDateAdapter(),
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close') } },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { customer: { id: 1, name: 'John Doe', loyalty_points: 100 } }
        },
        { provide: CustomSnackbarService, useClass: MockSnackbarService },
      ],
    })
    .compileComponents();

    TestBed.inject(AppConfig).set('BASE_URL', base);
    httpMock = TestBed.inject(HttpTestingController);
    snackbar = TestBed.inject(CustomSnackbarService) as unknown as MockSnackbarService;
    dialogRef = TestBed.inject(MatDialogRef);

    fixture = TestBed.createComponent(CustomerRedeemDialogComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    httpMock.verify();
  });

  it('redeems a valid number of points', () => {
    component.pointsToRedeem = 40;

    component.onSubmit();

    const req = httpMock.expectOne(`${base}/api/v1/customer/redeem-points`);
    expect(req.request.body).toEqual({ id: 1, points: 40 });
    req.flush({ status: true, message: 'Loyalty points redeemed successfully.', data: {} });

    expect(snackbar.openSnackBar).toHaveBeenCalledWith(
      'Loyalty points redeemed successfully.', 'success'
    );
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('refuses to redeem more points than the customer holds', () => {
    component.pointsToRedeem = 101;

    component.onSubmit();

    expect(snackbar.openSnackBar).toHaveBeenCalledWith('Only 100 points are available', 'error');
    httpMock.expectNone(`${base}/api/v1/customer/redeem-points`);
  });

  it('refuses zero, negative or fractional points', () => {
    for (const points of [0, -5, 1.5]) {
      component.pointsToRedeem = points;
      component.onSubmit();
    }

    expect(snackbar.openSnackBar).toHaveBeenCalledTimes(3);
    httpMock.expectNone(`${base}/api/v1/customer/redeem-points`);
  });
});
