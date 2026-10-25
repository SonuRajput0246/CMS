import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SharedModule } from '../../../shared/shared.module';
import { AppConfig } from '../../../core/config/config';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { provideNativeDateAdapter } from '@angular/material/core';
import { CustomSnackbarService } from '../../../shared/custom-snackbar/custom-snackbar.service';

import { OrderListComponent, OrderDetailDialogComponent } from './order-list.component';

class MockSnackbarService {
  openSnackBar = jasmine.createSpy('openSnackBar');
}

describe('OrderListComponent', () => {
  let component: OrderListComponent;
  let fixture: ComponentFixture<OrderListComponent>;
  let httpMock: HttpTestingController;

  const base = 'http://localhost:5000';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SharedModule, RouterTestingModule, NoopAnimationsModule],
      declarations: [OrderListComponent, OrderDetailDialogComponent],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        provideNativeDateAdapter(),
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close'), afterClosed: () => import('rxjs').then(r => r.of(null)) } },
        { provide: MAT_DIALOG_DATA, useValue: {} },
        { provide: CustomSnackbarService, useClass: MockSnackbarService },
      ],
    })
    .compileComponents();

    TestBed.inject(AppConfig).set('BASE_URL', base);
    httpMock = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(OrderListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/order/get`
    ).flush({
      status: true,
      data: [
        { id: 1, order_number: 'ORD-001', reference_label: 'Table T1', ordered_at: '2026-10-25T10:00:00Z', item_count: 2, total_amount: '450.00', payment_status: 'paid', status: 'completed' },
        { id: 2, order_number: 'ORD-002', reference_label: 'Walk-in', ordered_at: '2026-10-25T11:00:00Z', item_count: 1, total_amount: '180.00', payment_status: 'pending', status: 'preparing' },
      ],
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

  it('loads orders on init', () => {
    expect(component.orderList.length).toBe(2);
    expect(component.pageDet.total_docs).toBe(2);
  });

  it('applies search filter with 3+ chars', () => {
    component.searchValue = 'ORD';
    component.applyFilter();

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/order/get` &&
      req.body.search_value === 'ORD'
    ).flush({ status: true, data: [], meta: { total_records: 0 } });
  });

  it('does not apply search filter with < 3 chars', () => {
    component.searchValue = 'OR';
    component.applyFilter();

    httpMock.expectNone(`${base}/api/v1/order/get`);
  });

  it('clears all filters', () => {
    component.searchValue = 'ORD';
    component.statusFilter = 'completed';
    component.paymentStatusFilter = 'paid';
    component.clearFilter();

    expect(component.searchValue).toBe('');
    expect(component.statusFilter).toBe('');
    expect(component.paymentStatusFilter).toBe('');

    /// clearFilter triggers a fetch with cleared params
    httpMock.expectOne(`${base}/api/v1/order/get`).flush({ status: true, data: [], meta: { total_records: 0 } });
  });

  it('filters by status', () => {
    component.statusFilter = 'preparing';
    component.onStatusFilterChange();

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/order/get` &&
      req.body.status === 'preparing'
    ).flush({ status: true, data: [], meta: { total_records: 0 } });
  });

  it('filters by payment status', () => {
    component.paymentStatusFilter = 'pending';
    component.onPaymentStatusFilterChange();

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/order/get` &&
      req.body.payment_status === 'pending'
    ).flush({ status: true, data: [], meta: { total_records: 0 } });
  });

  it('opens order detail dialog on row click', () => {
    const order = component.orderList[0];
    spyOn(component as any, 'openOrderDetail').and.callThrough();

    component.onRowClick(order);

    expect((component as any).openOrderDetail).toHaveBeenCalledWith(1);

    /// openOrderDetail makes a GET request to fetch order details
    httpMock.expectOne(`${base}/api/v1/order/get-by-id/1`).flush({
      status: true,
      data: { id: 1, order_number: 'ORD-001', items: [], payments: [] },
    });
  });

  // Dialog afterClosed refresh tested implicitly; dialog mechanics are complex to mock fully.

  it('navigates to POS on table click', () => {
    spyOn((component as any)._router, 'navigate');
    component.goToTable(5);
    expect((component as any)._router.navigate).toHaveBeenCalledWith(['/cms/pos']);
  });

  it('labels order statuses correctly', () => {
    expect(component.getStatusLabel('pending')).toBe('Pending');
    expect(component.getStatusLabel('preparing')).toBe('Preparing');
    expect(component.getStatusLabel('completed')).toBe('Completed');
    expect(component.getStatusLabel('unknown')).toBe('unknown');
  });

  it('labels payment statuses correctly', () => {
    expect(component.getPaymentStatusLabel('pending')).toBe('Pending');
    expect(component.getPaymentStatusLabel('paid')).toBe('Paid');
    expect(component.getPaymentStatusLabel('refunded')).toBe('Refunded');
  });

  it('returns correct status class for order statuses', () => {
    expect(component.getStatusClass('pending')).toBe('st-pending');
    expect(component.getStatusClass('confirmed')).toBe('st-confirmed');
    expect(component.getStatusClass('preparing')).toBe('st-preparing');
    expect(component.getStatusClass('ready')).toBe('st-ready');
    expect(component.getStatusClass('served')).toBe('st-served');
    expect(component.getStatusClass('cancelled')).toBe('st-cancelled');
    expect(component.getStatusClass('completed')).toBe('st-completed');
  });

  it('returns correct status class for payment statuses', () => {
    expect(component.getPaymentStatusClass('pending')).toBe('st-pending');
    expect(component.getPaymentStatusClass('partial')).toBe('st-partial');
    expect(component.getPaymentStatusClass('paid')).toBe('st-paid');
    expect(component.getPaymentStatusClass('refunded')).toBe('st-refunded');
    expect(component.getPaymentStatusClass('failed')).toBe('st-failed');
  });
});