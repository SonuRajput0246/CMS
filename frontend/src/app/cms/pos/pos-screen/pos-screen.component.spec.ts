import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SharedModule } from '../../../shared/shared.module';
import { AppConfig } from '../../../core/config/config';

import { PosScreenComponent } from './pos-screen.component';

describe('PosScreenComponent', () => {
  let component: PosScreenComponent;
  let fixture: ComponentFixture<PosScreenComponent>;
  let httpMock: HttpTestingController;

  const base = 'http://localhost:5000';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SharedModule, RouterTestingModule, NoopAnimationsModule],
      declarations: [PosScreenComponent],
      providers: [
        /// Real backend module first so the app's own interceptors are in the
        /// chain, then the testing backend over it so nothing escapes to the
        /// network.
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    })
    .compileComponents();

    /// Services read BASE_URL from AppConfig in their constructor and
    /// AppConfig throws when the key is missing.
    TestBed.inject(AppConfig).set('BASE_URL', base);
    httpMock = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(PosScreenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    /// ngOnInit fans out to three independent reads via forkJoin; answer all
    /// of them so the test never leaves a request dangling (which would fail
    /// verify()).
    httpMock.expectOne(`${base}/api/v1/table/get-floor-view`).flush({
      status: true,
      data: {
        total_tables: 3,
        zones: [
          {
            zone_display_name: 'Indoor',
            tables: [
              { id: 1, table_number: 'T1', capacity: 4, status: 'available' },
              {
                id: 2, table_number: 'T2', capacity: 2, status: 'occupied',
                active_order: { order_number: 'ORD-1', total_amount: '450.00' }
              },
              { id: 3, table_number: 'T3', status: 'cleaning' },
            ],
          },
        ],
      },
    });

    httpMock.expectOne(`${base}/api/v1/pos/get-summary`).flush({
      status: true,
      data: {
        tables: { available: 1, occupied: 1 },
        open_orders: 1,
        today: { revenue: '450.00' },
      },
    });

    httpMock.expectOne(`${base}/api/v1/recipe/get-menu`).flush({
      status: true,
      data: {
        recipe_count: 3,
        sections: [
          {
            category_id: 5,
            category_display_name: 'Coffee',
            recipes: [
              { id: 10, name: 'Latte', selling_price: '180.00', is_vegan: false },
              { id: 11, name: 'Mocha', selling_price: '210.00', is_vegan: true },
            ],
          },
          {
            category_id: null,
            category_display_name: 'Uncategorised',
            recipes: [{ id: 12, name: 'Mystery', selling_price: '99.00' }],
          },
        ],
      },
    });

    fixture.detectChanges();
  });

  afterEach(() => {
    /// destroy() cancels the 15s floor poll through takeUntilDestroyed().
    fixture.destroy();
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads the floor, the till counters and the menu in one paint', () => {
    expect(component.floorView?.total_tables).toBe(3);
    expect(component.zones.length).toBe(1);
    expect(component.summary?.open_orders).toBe(1);
    expect(component.sections.length).toBe(2);
  });

  it('flattens every section for the Full menu view', () => {
    expect(component.activeSectionKey).toBe('all');
    expect(component.visibleRecipes.length).toBe(3);
  });

  it('filters the grid to the tapped section', () => {
    component.onSelectSection(component.sections[0]);

    expect(component.visibleRecipes.length).toBe(2);
    expect(component.activeSectionTitle).toBe('Coffee');
  });

  it('keys a null category as "none" so the rail can key every tab', () => {
    expect(component.sectionKey(component.sections[0])).toBe('5');
    expect(component.sectionKey(component.sections[1])).toBe('none');
  });

  it('greys out a table that is still being cleaned instead of seating it', () => {
    const cleaning = component.zones[0].tables[2];

    component.onTableTap(cleaning);

    /// Housekeeping states are rejected locally -- no create request at all.
    httpMock.expectNone(`${base}/api/v1/order/create`);
  });

  it('opens the live bill when an occupied table is tapped', () => {
    const occupied = component.zones[0].tables[1];

    component.onTableTap(occupied);

    httpMock.expectOne(`${base}/api/v1/order/get-active-by-table/2`).flush({
      status: true,
      data: {
        id: 77,
        order_number: 'ORD-1',
        reference_label: 'Table T2',
        status: 'open',
        subtotal: '450.00',
        tax_amount: '0.00',
        discount_amount: '0.00',
        total_amount: '450.00',
        paid_amount: '0.00',
        due_amount: '450.00',
        items: [
          {
            id: 900, item_name: 'Latte', quantity: '2', unit_price: '180.00',
            total_price: '360.00', prep_status: 'preparing'
          },
        ],
      },
    });

    /// The bill is fetched alongside the order because kitchen_outstanding
    /// only exists on the bill read model.
    httpMock.expectOne(`${base}/api/v1/pos/get-bill`).flush({
      status: true,
      data: {
        order_id: 77,
        totals: {
          item_subtotal: '450.00', tax_amount: '0.00', discount_amount: '0.00',
          total_amount: '450.00', paid_amount: '0.00', due_amount: '450.00'
        },
        kitchen_outstanding: 1,
      },
    });

    expect(component.order?.id).toBe(77);
    expect(component.cartItems.length).toBe(1);
    expect(component.cartCount).toBe(2);
    expect(component.dueAmount).toBe(450);
    expect(component.kitchenOutstanding).toBe(1);
  });

  it('refuses to step a line below one without calling the API', () => {
    const line = { id: 900, item_name: 'Latte', quantity: '1', prep_status: 'pending' };
    component.order = { id: 77, items: [line] } as any;

    component.onStepQuantity(line as any, -1);

    /// quantity > 0 is a DB constraint; the stepper bottoms out at 1 rather
    /// than letting the server reject a zero.
    httpMock.expectNone(`${base}/api/v1/order/77/items/update-quantity`);
    expect(component.order?.items.length).toBe(1);
  });

  it('computes change from the bill due, floored at zero', () => {
    component.bill = {
      order_id: 77,
      totals: {
        item_subtotal: '450.00', tax_amount: '0.00', discount_amount: '0.00',
        total_amount: '450.00', paid_amount: '0.00', due_amount: '450.00'
      },
      kitchen_outstanding: 0,
    } as any;

    component.cashTendered = '500';
    expect(component.tenderedAmount).toBe(500);
    expect(component.changeDue).toBe(50);

    /// A short tender is a problem to solve, not change to hand back.
    component.cashTendered = '100';
    expect(component.changeDue).toBe(0);
  });

  it('labels statuses through the shared label maps', () => {
    expect(component.tableLabel('available')).toBe('Available');
    expect(component.prepLabel('ready')).toBe('Ready');
  });
});
