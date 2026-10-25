import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { convertToParamMap, ActivatedRoute } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of as observableOf } from 'rxjs';
import { SharedModule } from '../../../shared/shared.module';
import { AppConfig } from '../../../core/config/config';

import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  /// ActivatedRoute is injected by anything that reads route state. The
  /// scaffold only needs it to exist; the components under test are not
  /// exercised for navigation here.
  const activatedRouteStub = {
    snapshot: {
      paramMap: convertToParamMap({ id: '0' }),
      queryParamMap: convertToParamMap({}),
      url: ['/'],
      params: {},
      queryParams: {},
      data: {},
    },
    paramMap: observableOf(convertToParamMap({ id: '0' })),
    queryParamMap: observableOf(convertToParamMap({})),
    params: observableOf({}),
    queryParams: observableOf({}),
    url: observableOf(['/']),
    data: observableOf({}),
  };
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SharedModule, RouterTestingModule, NoopAnimationsModule],
      declarations: [DashboardComponent],
      providers: [
        /// Real backend module first so the app's own interceptors are in the
        /// chain, then the testing backend over it so nothing escapes to the
        /// network. Several of these components call a service in ngOnInit.
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: activatedRouteStub },
      ],
    })
    .compileComponents();

    /// Services read BASE_URL from AppConfig in their constructor and
    /// AppConfig throws when the key is missing.
    TestBed.inject(AppConfig).set('BASE_URL', 'http://localhost:5000');
    httpMock = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    /// ngOnInit fans out to three independent reads; answer all of them so the
    /// test never leaves a request dangling (which would fail verify()).
    httpMock.match('http://localhost:5000/api/v1/pos/get-summary').forEach(req =>
      req.flush({
        status: true,
        data: {
          open_orders: 3,
          today: { completed_orders: 7, revenue: '1250.00', average_ticket: '178.57' }
        }
      })
    );

    httpMock.match('http://localhost:5000/api/v1/table/get').forEach(req =>
      req.flush({
        status: true,
        data: [
          { id: 1, status: 'available' },
          { id: 2, status: 'occupied' },
          { id: 3, status: 'available' },
        ],
        meta: { last_page: 1 }
      })
    );

    httpMock.match('http://localhost:5000/api/v1/kds/get-tickets').forEach(req =>
      req.flush({
        status: true,
        data: {
          tickets: [
            {
              order_number: 'ORD-0001',
              reference_label: 'Table 4',
              max_wait_minutes: 24,
              item_count: 2,
              order_status: 'preparing'
            }
          ],
          ticket_count: 1,
          summary: { pending: 1, preparing: 1, ready: 0 }
        }
      })
    );

    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('counts tables by status for the KPI cards', () => {
    expect(component.floorCounts?.['available']).toBe(2);
    expect(component.floorCounts?.['occupied']).toBe(1);
    expect(component.floorCounts?.['total']).toBe(3);
  });

  it('loads the kitchen queue', () => {
    expect(component.kdsTickets.length).toBe(1);
    expect(component.kdsSummary?.preparing).toBe(1);
  });

  it('grades a ticket wait as danger past 20 minutes', () => {
    expect(component.getWaitColor(24)).toBe('danger');
    expect(component.getWaitColor(12)).toBe('warn');
    expect(component.getWaitColor(3)).toBe('');
  });
});
