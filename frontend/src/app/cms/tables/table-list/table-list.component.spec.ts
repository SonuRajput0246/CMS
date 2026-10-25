import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SharedModule } from '../../../shared/shared.module';
import { AppConfig } from '../../../core/config/config';

import { TableListComponent } from './table-list.component';

describe('TableListComponent', () => {
  let component: TableListComponent;
  let fixture: ComponentFixture<TableListComponent>;
  let httpMock: HttpTestingController;

  const base = 'http://localhost:5000';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SharedModule, RouterTestingModule, NoopAnimationsModule],
      declarations: [TableListComponent],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    })
    .compileComponents();

    TestBed.inject(AppConfig).set('BASE_URL', base);
    httpMock = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(TableListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    /// ngOnInit fans out to three reads: zones, tables, and zone counts on tab change.
    /// Answer them all so the test never leaves a request dangling.
    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/table-zone/get`
    ).flush({
      status: true,
      data: [
        { id: 1, name: 'indoor', display_name: 'Indoor', display_order: 1, is_active: true, table_count: 0 },
        { id: 2, name: 'patio', display_name: 'Patio', display_order: 2, is_active: true, table_count: 0 },
      ],
    });

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/table/get`
    ).flush({
      status: true,
      data: [
        { id: 10, table_number: 'T1', table_name: 'Window', capacity: 4, zone_id: 1, zone_name: 'Indoor', status: 'available', is_active: true, shape: 'square', is_combinable: true },
        { id: 11, table_number: 'T2', table_name: '', capacity: 2, zone_id: 2, zone_name: 'Patio', status: 'occupied', is_active: true, shape: 'round', is_combinable: false },
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

  it('loads zones and tables on init', () => {
    expect(component.zoneList.length).toBe(2);
    expect(component.tableList.length).toBe(2);
    expect(component.pageDet.total_docs).toBe(2);
  });

  it('filters tables by zone id', () => {
    component.filterZoneId = 2;
    component.onZoneFilter();

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/table/get` &&
      req.body.zone_id === 2
    ).flush({ status: true, data: [], meta: { total_records: 0 } });

    expect(component.filterZoneId).toBe(2);
  });

  it('filters tables by status', () => {
    component.filterStatus = 'occupied';
    component.onStatusFilter();

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/table/get` &&
      req.body.status === 'occupied'
    ).flush({ status: true, data: [], meta: { total_records: 0 } });

    expect(component.filterStatus).toBe('occupied');
  });

  it('resets filters and refetches', () => {
    component.gridSearch = 'T1';
    component.filterZoneId = 1;
    component.filterStatus = 'available';
    component.clearFilter();

    expect(component.gridSearch).toBe('');
    expect(component.filterZoneId).toBeNull();
    expect(component.filterStatus).toBeNull();

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/table/get` &&
      req.body.search_value === '' && req.body.zone_id === null && req.body.status === null
    ).flush({ status: true, data: [], meta: { total_records: 0 } });
  });

  it('opens add table dialog with defaults', () => {
    component.onAddTable();
    expect(component.editingTable).toBeNull();
    expect(component.tableForm.value.table_number).toBe('');
    expect(component.tableForm.value.capacity).toBe(2);
  });

  it('opens edit table dialog with row data', () => {
    const row = component.tableList[0];
    component.onEditTable(row);

    expect(component.editingTable?.id).toBe(10);
    expect(component.tableForm.value.table_number).toBe('T1');
    expect(component.tableForm.value.zone_id).toBe(1);
  });

  it('rejects save when table form is invalid', () => {
    component.tableForm.reset({ table_number: '', capacity: 0 });
    component.saveTable({ close: () => {} });

    httpMock.expectNone(`${base}/api/v1/table/upsert`);
  });

  it('saves a table via upsert and reloads', () => {
    component.tableForm.reset({ table_number: 'T3', table_name: 'Bar', capacity: 2, zone_id: 1, shape: 'square', is_combinable: true, is_active: true });
    component.saveTable({ close: () => {} });

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/table/upsert` &&
      req.body.table_number === 'T3'
    ).flush({ status: true, message: 'Table saved successfully' });

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/table/get`
    ).flush({ status: true, data: [], meta: { total_records: 0 } });

    expect(component.tableForm.value.table_number).toBe('T3');
  });

  it('does not offer occupied in the status dialog', () => {
    const occupiedTable = component.tableList[1];
    component.onChangeStatus(occupiedTable);

    expect(component.settableStatuses).not.toContain('occupied');
    expect(component.statusForm.value.status).toBe('available'); // falls back
  });

  it('rejects saving an occupied status manually', () => {
    component.statusForm.reset({ status: 'occupied', remarks: '' });
    component.editingTable = { id: 1 } as any;
    component.saveStatus({ close: () => {} });

    httpMock.expectNone(`${base}/api/v1/table/update-status`);
  });

  it('toggles is_active inline', () => {
    const row = component.tableList[0];
    component.onToggleActive(row, false);

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/table/upsert` &&
      req.body.is_active === false
    ).flush({ status: true });

    expect(row.is_active).toBeFalse();
  });

  it('deletes a table (soft delete via upsert)', () => {
    component.editingTable = component.tableList[0];
    (component as any).executeDeleteTable(component.tableList[0]);

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/table/upsert` &&
      req.body.is_deleted === true
    ).flush({ status: true, message: 'Table deleted successfully' });

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/table/get`
    ).flush({ status: true, data: [], meta: { total_records: 0 } });
  });

  it('loads zones tab and fetches counts when switched', () => {
    component.selectedTabIndex = 1;
    component.onTabChange(1);

    httpMock.expectOne(req =>
      req.method === 'GET' && req.url.includes('/api/v1/table-zone/get-table-count?id=1')
    ).flush({ status: true, data: { table_count: 5 } });

    httpMock.expectOne(req =>
      req.method === 'GET' && req.url.includes('/api/v1/table-zone/get-table-count?id=2')
    ).flush({ status: true, data: { table_count: 3 } });
  });

  it('adds a zone', () => {
    component.zoneForm.reset({ name: 'bar', display_name: 'Bar', description: '', display_order: 0, is_active: true });
    component.saveZone({ close: () => {} });

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/table-zone/upsert` &&
      req.body.name === 'bar'
    ).flush({ status: true, message: 'Zone saved successfully' });

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/table-zone/get`
    ).flush({ status: true, data: [] });
  });

  it('deletes a zone with warning about unassigned tables', () => {
    component.editingZone = { id: 2, name: 'patio', display_name: 'Patio', table_count: 4 } as any;
    (component as any).executeDeleteZone(component.editingZone);

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/table-zone/upsert` &&
      req.body.is_deleted === true
    ).flush({ status: true, message: 'Zone deleted successfully' });

    httpMock.expectOne(req =>
      req.method === 'POST' && req.url === `${base}/api/v1/table-zone/get`
    ).flush({ status: true, data: [] });
  });

  it('labels statuses through the shared map', () => {
    expect(component.statusLabel('available')).toBe('Available');
    expect(component.statusLabel('occupied')).toBe('Occupied');
    expect(component.statusLabel(null)).toBe('Unknown');
  });

  it('generates a class fragment from the status', () => {
    expect(component.statusClass('cleaning')).toBe('st-cleaning');
    expect(component.statusClass(null)).toBe('st-unknown');
  });

  it('resolves zone names for the table row', () => {
    expect(component.zoneName(1)).toBe('indoor');
    expect(component.zoneName(null)).toBe('Unassigned');
    expect(component.zoneName(999)).toBe('Unassigned');
  });

  it('tracks busy ids during inline writes', () => {
    component.busyIds.add(10);
    expect(component.isBusy(10)).toBeTrue();
    expect(component.isBusy(11)).toBeFalse();
  });

  it('computes serial numbers across pages', () => {
    // requestData is private; test via the public getter and internal knowledge
    (component as any).requestData.page_number = 2;
    (component as any).requestData.page_size = 10;
    expect(component.getSrNo(0)).toBe(11);
    expect(component.getSrNo(4)).toBe(15);
  });
});