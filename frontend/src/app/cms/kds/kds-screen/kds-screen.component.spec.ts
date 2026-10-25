import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SharedModule } from '../../../shared/shared.module';
import { AppConfig } from '../../../core/config/config';

import { KdsScreenComponent } from './kds-screen.component';

describe('KdsScreenComponent', () => {
  let component: KdsScreenComponent;
  let fixture: ComponentFixture<KdsScreenComponent>;
  let httpMock: HttpTestingController;

  const base = 'http://localhost:5000';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SharedModule, RouterTestingModule, NoopAnimationsModule],
      declarations: [KdsScreenComponent],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    })
    .compileComponents();

    TestBed.inject(AppConfig).set('BASE_URL', base);
    httpMock = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(KdsScreenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    /// First paint: board + station badges via forkJoin.
    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/kds/get-tickets`
    ).flush({
      status: true,
      data: {
        station: null,
        tickets: [
          {
            order_id: 101,
            order_number: 'ORD-101',
            reference_label: 'Table T4',
            max_wait_minutes: 24,
            item_count: 3,
            kitchen_notes: 'no onions',
            items: [
              { id: 1, order_id: 101, item_name: 'Biryani', quantity: 2, prep_status: 'pending', station: 'grill' },
              { id: 2, order_id: 101, item_name: 'Raita', quantity: 1, prep_status: 'preparing', station: 'cold' },
              { id: 3, order_id: 101, item_name: 'Gulab jamun', quantity: 1, prep_status: 'ready', station: 'cold' },
            ],
          },
        ],
        summary: { pending: 1, preparing: 1, ready: 1 },
        server_time: '2026-10-25T12:00:00Z',
      },
    });

    httpMock.expectOne(`${base}/api/v1/kds/get-station-summary`).flush({
      status: true,
      data: {
        stations: [
          { station: 'grill', total: 1, pending: 1, preparing: 0, ready: 0 },
          { station: 'cold', total: 2, pending: 0, preparing: 1, ready: 1 },
        ],
      },
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

  it('loads the board, the station badges and the summary in one paint', () => {
    expect(component.tickets.length).toBe(1);
    expect(component.stations.length).toBe(2);
    expect(component.summary.pending).toBe(1);
    expect(component.summary.preparing).toBe(1);
    expect(component.summary.ready).toBe(1);
    expect(component.serverTime).toBe('2026-10-25T12:00:00Z');
  });

  it('counts only pending/preparing lines as outstanding', () => {
    const ticket = component.tickets[0];
    expect(component.countOutstanding(ticket)).toBe(2);
  });

  it('grades wait time into ok / warn / late bands', () => {
    expect(component.waitClass(3)).toBe('wait-ok');
    expect(component.waitClass(10)).toBe('wait-warn');
    expect(component.waitClass(20)).toBe('wait-late');
  });

  it('starts with no line busy', () => {
    const item = component.tickets[0].items[0];
    expect(component.isLineBusy(item)).toBe(false);
  });

  it('does nothing when the active station is re-selected', () => {
    component.onStationChange(null);

    httpMock.expectNone(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/kds/get-tickets`
    );
  });

  it('reloads the board when the station changes', () => {
    component.onStationChange('grill' as any);

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/kds/get-tickets`
    ).flush({ status: true, data: { station: 'grill', tickets: [], summary: { pending: 0, preparing: 0, ready: 0 }, server_time: 'x' } });

    httpMock.expectOne(`${base}/api/v1/kds/get-station-summary`).flush({
      status: true, data: { stations: [] }
    });

    expect(component.activeStation).toBe('grill');
    expect(component.tickets.length).toBe(0);
  });

  it('reloads the board when plated items are toggled', () => {
    component.onToggleIncludeReady(true);

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/kds/get-tickets`
    ).flush({ status: true, data: { station: null, tickets: [], summary: { pending: 0, preparing: 0, ready: 0 }, server_time: 'x' } });

    httpMock.expectOne(`${base}/api/v1/kds/get-station-summary`).flush({
      status: true, data: { stations: [] }
    });

    expect(component.includeReady).toBe(true);
  });

  it('moves a line to preparing and re-reads the board', () => {
    const item = component.tickets[0].items[0];

    component.onStart(item);

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/kds/101/prep-status`
    ).flush({ status: true, message: 'ok' });

    /// setPrep() re-reads via poll() after a successful write.
    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/kds/get-tickets`
    ).flush({ status: true, data: { station: null, tickets: [], summary: { pending: 0, preparing: 0, ready: 0 }, server_time: 'x' } });

    httpMock.expectOne(`${base}/api/v1/kds/get-station-summary`).flush({
      status: true, data: { stations: [] }
    });
  });

  it('labels stations and prep states through the shared maps', () => {
    expect(component.labelForStation('grill' as any)).toBe('Grill');
    expect(component.prepLabel('ready')).toBe('Ready');
    expect(component.spiceLabel('extra_hot')).toBe('extra hot');
  });
});
