import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SharedModule } from '../../../shared/shared.module';
import { AppConfig } from '../../../core/config/config';
import { CustomSnackbarService } from '../../../shared/custom-snackbar/custom-snackbar.service';

import { OrderDetailPageComponent } from './order-detail.component';

class MockSnackbarService {
  openSnackBar = jasmine.createSpy('openSnackBar');
}

describe('OrderDetailPageComponent', () => {
  const base = 'http://localhost:5000';

  const orderPayload = {
    id: 7,
    order_number: 'ORD-007',
    reference_label: 'Table T2',
    order_type: 'dine_in',
    status: 'preparing',
    payment_status: 'pending',
    ordered_at: '2026-10-25T10:00:00Z',
    subtotal: '400.00',
    tax_amount: '20.00',
    discount_amount: '0.00',
    total_amount: '420.00',
    paid_amount: '0.00',
    due_amount: '420.00',
    item_count: 1,
    table: { id: 2, table_number: 'T2' },
    items: [
      { id: 1, item_name: 'Masala Chai', quantity: '2', unit_price: '200.00', total_price: '400.00', spice_level: 'medium' }
    ],
    payments: []
  };

  async function setup(id?: string): Promise<{
    fixture: ComponentFixture<OrderDetailPageComponent>;
    component: OrderDetailPageComponent;
    httpMock: HttpTestingController;
    router: Router;
  }> {
    await TestBed.configureTestingModule({
      imports: [SharedModule, RouterTestingModule, NoopAnimationsModule],
      declarations: [OrderDetailPageComponent],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } }
        },
        { provide: CustomSnackbarService, useClass: MockSnackbarService },
      ],
    }).compileComponents();

    TestBed.inject(AppConfig).set('BASE_URL', base);
    const httpMock = TestBed.inject(HttpTestingController);
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(OrderDetailPageComponent);
    fixture.detectChanges();

    return { fixture, component: fixture.componentInstance, httpMock, router };
  }

  describe('with a valid id', () => {
    let fixture: ComponentFixture<OrderDetailPageComponent>;
    let component: OrderDetailPageComponent;
    let httpMock: HttpTestingController;
    let router: Router;

    beforeEach(async () => {
      ({ fixture, component, httpMock, router } = await setup('7'));
      httpMock.expectOne(req =>
        req.method === 'GET' && req.url === `${base}/api/v1/order/get-by-id/7`
      ).flush({ status: true, data: orderPayload });
      fixture.detectChanges();
    });

    afterEach(() => {
      fixture.destroy();
      httpMock.verify();
    });

    it('loads the order named by the route', () => {
      expect(component.order?.order_number).toBe('ORD-007');
      expect(component.loadFailed).toBeFalse();
      expect(component.navData[2].displayValue).toBe('ORD-007');
    });

    it('renders the header, meta and item lines', () => {
      const el: HTMLElement = fixture.nativeElement;

      expect(el.querySelector('.detail-head h3')?.textContent).toContain('ORD-007');
      expect(el.querySelector('.chip.st-preparing')?.textContent).toContain('Preparing');
      expect(el.querySelector('.chip.pay-pending')?.textContent).toContain('Pending');
      expect(el.textContent).toContain('Table T2');
      expect(el.querySelectorAll('.lines tbody tr').length).toBe(1);
      expect(el.querySelector('.tot-row.grand')?.textContent).toContain('420.00');
      expect(el.querySelector('.not-found')).toBeNull();
    });

    it('returns to the order list', () => {
      const nav = spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
      component.goBack();
      expect(nav).toHaveBeenCalledWith(['/cms/orders']);
    });

    it('requests the bill for this order when printing', () => {
      const openSpy = spyOn(component as any, 'openPrintWindow').and.stub();

      component.printBill();

      const req = httpMock.expectOne(`${base}/api/v1/pos/get-bill`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ order_id: 7 });
      req.flush({ status: true, data: { order_number: 'ORD-007', items: [] } });

      expect(openSpy).toHaveBeenCalled();
    });
  });

  describe('without a route id', () => {
    let fixture: ComponentFixture<OrderDetailPageComponent>;
    let component: OrderDetailPageComponent;
    let httpMock: HttpTestingController;

    beforeEach(async () => {
      ({ fixture, component, httpMock } = await setup());
    });

    afterEach(() => {
      fixture.destroy();
      httpMock.verify();
    });

    it('shows the not-found card instead of fetching', () => {
      const el: HTMLElement = fixture.nativeElement;

      expect(component.loadFailed).toBeTrue();
      expect(component.order).toBeNull();
      expect(el.querySelector('.detail-card.not-found')).toBeTruthy();
      expect(httpMock.match(() => true).length).toBe(0);
    });
  });

  describe('when the order cannot be loaded', () => {
    let fixture: ComponentFixture<OrderDetailPageComponent>;
    let component: OrderDetailPageComponent;
    let httpMock: HttpTestingController;

    beforeEach(async () => {
      ({ fixture, component, httpMock } = await setup('99'));
      httpMock.expectOne(`${base}/api/v1/order/get-by-id/99`).flush({
        status: false,
        message: 'Order not found'
      });
      fixture.detectChanges();
    });

    afterEach(() => {
      fixture.destroy();
      httpMock.verify();
    });

    it('reports the failure and shows the not-found card', () => {
      const snackbar = TestBed.inject(CustomSnackbarService) as unknown as MockSnackbarService;

      expect(component.loadFailed).toBeTrue();
      expect(snackbar.openSnackBar).toHaveBeenCalledWith('Order not found', 'error');
      expect(fixture.nativeElement.querySelector('.detail-card.not-found')).toBeTruthy();
    });
  });
});
