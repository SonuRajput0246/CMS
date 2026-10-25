import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideNativeDateAdapter } from '@angular/material/core';

import { SharedModule } from '../../shared/shared.module';
import { AppConfig } from '../../core/config/config';
import { CustomSnackbarService } from '../../shared/custom-snackbar/custom-snackbar.service';
import { IReportRangeMeta } from '../../models/ICms.model';

import { ReportScreenComponent } from './report-screen.component';

class MockSnackbarService {
  openSnackBar = jasmine.createSpy('openSnackBar');
}

describe('ReportScreenComponent', () => {
  let component: ReportScreenComponent;
  let fixture: ComponentFixture<ReportScreenComponent>;
  let httpMock: HttpTestingController;
  let snackbar: MockSnackbarService;

  const base = 'http://localhost:5000';
  const salesUrl = `${base}/api/v1/report/sales-summary`;

  const rangeMeta: IReportRangeMeta = {
    preset: 'today',
    from_date: '2026-10-26',
    to_date: '2026-10-26',
    day_count: 1,
    timezone: 'Asia/Kolkata',
    utc_start: '2026-10-25T18:30:00',
    utc_end_exclusive: '2026-10-26T18:30:00'
  };

  const salesData = {
    range: rangeMeta,
    totals: {
      order_count: 4,
      revenue: '22995.00',
      tax_amount: '0.00',
      discount_amount: '0.00',
      collected: '22995.00',
      outstanding: '0.00',
      average_ticket: '5748.75'
    },
    by_payment_method: [],
    by_order_type: [],
    hourly: {}
  };

  function flushSales(data: any = salesData): void {
    httpMock.expectOne(req => req.method === 'POST' && req.url === salesUrl)
      .flush({ status: true, data });
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SharedModule, RouterTestingModule, NoopAnimationsModule],
      declarations: [ReportScreenComponent],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        provideNativeDateAdapter(),
        { provide: CustomSnackbarService, useClass: MockSnackbarService }
      ]
    }).compileComponents();

    TestBed.inject(AppConfig).set('BASE_URL', base);
    httpMock = TestBed.inject(HttpTestingController);
    snackbar = TestBed.inject(CustomSnackbarService) as unknown as MockSnackbarService;

    fixture = TestBed.createComponent(ReportScreenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    flushSales();
  });

  afterEach(() => {
    fixture.destroy();
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(component.reportTabs.length).toBe(6);
  });

  it('loads the sales summary for the default range on init', () => {
    expect(component.salesSummary?.totals.revenue).toBe('22995.00');
    expect(component.rangeMeta?.timezone).toBe('Asia/Kolkata');
  });

  it('posts the shared window plus sales options', () => {
    component.form.get('range')!.setValue('last_7_days');

    const req = httpMock.expectOne(salesUrl);
    expect(req.request.body).toEqual({
      range: 'last_7_days',
      include_hourly: true,
      include_payment_breakdown: true
    });
    req.flush({ status: true, data: salesData });
  });

  it('fetches item sales with the tab controls', () => {
    component.onTabChange(1);

    const req = httpMock.expectOne(`${base}/api/v1/report/item-sales`);
    expect(req.request.body).toEqual({
      range: 'today',
      sort_by: 'quantity',
      limit: 20,
      include_dead_stock: false,
      station: null
    });
    req.flush({
      status: true,
      data: {
        range: rangeMeta,
        sort_by: 'quantity',
        items: [{
          item_type: 'recipe', item_id: 1, item_name: 'Paneer Tikka',
          category_display_name: 'Starters', station: 'tandoor',
          quantity_sold: '20.00', revenue: '4800.00', order_count: 11,
          quantity_per_order: '1.82'
        }],
        distinct_items_sold: 1, total_quantity: '20.00', total_revenue: '4800.00',
        returned: 1, truncated: false
      }
    });

    expect(component.itemSales?.items.length).toBe(1);
    expect(component.itemSales?.items[0].category_display_name).toBe('Starters');
  });

  it('fetches each remaining report on its own tab', () => {
    component.onTabChange(2);
    httpMock.expectOne(req =>
      req.url === `${base}/api/v1/report/daily-trend` &&
      req.body.include_zero_days === true
    ).flush({
      status: true,
      data: {
        range: rangeMeta,
        series: [
          { date: '2026-10-01', order_count: 2, revenue: '100.00', average_ticket: '50.00' },
          { date: '2026-10-02', order_count: 5, revenue: '400.00', average_ticket: '80.00' }
        ],
        day_count: 2, trading_days: 2, total_revenue: '500.00',
        best_day: { date: '2026-10-02', order_count: 5, revenue: '400.00' },
        average_daily_revenue: '250.00'
      }
    });
    expect(component.trendMax).toBe(400);

    component.onTabChange(3);
    httpMock.expectOne(req =>
      req.url === `${base}/api/v1/report/void-report` &&
      req.body.group_by_staff === true && req.body.limit === 100
    ).flush({
      status: true,
      data: {
        range: rangeMeta, entries: [], total_void_value: '0.00', total_void_lines: 0,
        cancelled_orders: 0, cancelled_value: '0.00', combined_loss: '0.00', by_staff: []
      }
    });

    component.onTabChange(4);
    httpMock.expectOne(req =>
      req.url === `${base}/api/v1/report/kitchen-performance` &&
      req.body.include_by_item === true && req.body.include_pending === false
    ).flush({
      status: true,
      data: {
        range: rangeMeta,
        overall: { lines_completed: 0, avg_minutes: 0, total_minutes: 0 },
        by_station: [], note: 'Average includes queue time.'
      }
    });

    component.onTabChange(5);
    httpMock.expectOne(req =>
      req.url === `${base}/api/v1/report/customer-report` && req.body.limit === 20
    ).flush({
      status: true,
      data: {
        range: rangeMeta,
        totals: {
          total_customers: 0, vip_customers: 0, loyalty_points_outstanding: 0,
          lifetime_spend: '0.00', total_visits: 0,
          avg_lifetime_value: '0.00', avg_spend_per_visit: '0.00'
        },
        new_customers_in_period: 0, period_active_customers: 0,
        top_customers: [], returned: 0
      }
    });

    expect(component.kitchenReport?.note).toContain('queue time');
    expect(component.customerReport?.top_customers).toEqual([]);
  });

  it('sends custom dates with a custom range', () => {
    const customMeta: IReportRangeMeta = {
      ...rangeMeta, preset: 'custom', from_date: '2026-10-01',
      to_date: '2026-10-10', day_count: 10
    };

    component.form.get('range')!.setValue('custom');
    component.form.get('from_date')!.setValue(new Date(2026, 9, 1));
    component.form.get('to_date')!.setValue(new Date(2026, 9, 10));
    component.onCustomDateChange();

    const req = httpMock.expectOne(salesUrl);
    expect(req.request.body.range).toBe('custom');
    expect(req.request.body.from_date).toBe('2026-10-01');
    expect(req.request.body.to_date).toBe('2026-10-10');

    req.flush({ status: true, data: { ...salesData, range: customMeta } });
    expect(component.rangeMeta?.from_date).toBe('2026-10-01');
  });

  it('waits for both custom dates before fetching', () => {
    component.form.get('range')!.setValue('custom');
    component.form.get('from_date')!.setValue(new Date(2026, 9, 1));
    component.onCustomDateChange();

    httpMock.expectNone(req => req.url.includes('/api/v1/report/'));
  });

  it('clears custom dates when a preset is chosen', () => {
    component.form.get('from_date')!.setValue(new Date(2026, 9, 1));
    component.form.get('to_date')!.setValue(new Date(2026, 9, 10));

    component.form.get('range')!.setValue('last_7_days');

    expect(component.form.get('from_date')!.value).toBeNull();
    expect(component.form.get('to_date')!.value).toBeNull();

    const req = httpMock.expectOne(salesUrl);
    expect(req.request.body.range).toBe('last_7_days');
    expect(req.request.body.from_date).toBeUndefined();
    expect(req.request.body.to_date).toBeUndefined();
    req.flush({ status: true, data: salesData });
  });

  it('clears stale figures when a report fails', () => {
    component.form.get('range')!.setValue('last_7_days');

    httpMock.expectOne(salesUrl).flush({ status: false, message: 'Report unavailable' });

    expect(component.salesSummary).toBeNull();
    expect(component.rangeMeta).toBeNull();
    expect(snackbar.openSnackBar).toHaveBeenCalledWith('Report unavailable', 'error');
  });

  it('refuses to export an empty dataset', () => {
    component.exportCsv([], 'item_sales');

    expect(snackbar.openSnackBar).toHaveBeenCalledWith('No data to export', 'warn');
  });

  it('exports CSV with commas and quotes escaped', async () => {
    let blob: Blob | undefined;
    spyOn(URL, 'createObjectURL').and.callFake((b: Blob) => {
      blob = b;
      return 'blob:test';
    });
    spyOn(URL, 'revokeObjectURL');
    spyOn(HTMLAnchorElement.prototype, 'click');

    component.exportCsv([{ item_name: 'Paneer, Tikka', reason: 'say "hi"' }], 'item_sales');

    expect(blob).toBeDefined();
    const text = await blob!.text();
    expect(text).toContain('"Paneer, Tikka"');
    expect(text).toContain('"say ""hi"""');
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    expect(snackbar.openSnackBar).toHaveBeenCalledWith('CSV exported', 'success');
  });

  it('scales chart bars without dividing by zero', () => {
    expect(component.barHeight(50, 100)).toBe(50);
    expect(component.barHeight(0, 100)).toBe(2);
    expect(component.barHeight(0, 0)).toBe(2);
    expect(component.maxOf([])).toBe(0);
    expect(component.maxOf([3, 9, 1])).toBe(9);
    expect(component.hourlyMax([{ revenue: '10.00' }, { revenue: '40.00' }])).toBe(40);
  });

  it('detects whether the hourly chart has any trade', () => {
    const flat = { hourly: { '2026-10-26': [{ revenue: '0.00' }] } } as any;
    const busy = { hourly: { '2026-10-26': [{ revenue: '0.00' }, { revenue: '5.00' }] } } as any;

    expect(component.hasAnyHourlyRevenue(flat)).toBeFalse();
    expect(component.hasAnyHourlyRevenue(busy)).toBeTrue();
    expect(component.hasAnyHourlyRevenue(null)).toBeFalse();
  });
});
