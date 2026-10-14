import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { convertToParamMap, ActivatedRoute, Router, RouterLink } from '@angular/router';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of as observableOf } from 'rxjs';
import { SharedModule } from '../../../shared/shared.module';
import { AppConfig } from '../../../core/config/config';

import { ListInventoryComponent } from './list-inventory.component';

/**
 * Navigation from the inventory list.
 *
 * These paths used to be built from the resolved product, because the same
 * component was mounted by two products and `/hms` was gated so the cafe
 * deployment could never reach it. There is one product now, so the paths are
 * literals -- and the tests that keep them honest are the ones below: a wrong
 * path here does not throw, it lands on the 404, which is the failure that
 * actually reached users.
 */
describe('ListInventoryComponent', () => {
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

  let component: ListInventoryComponent;
  let fixture: ComponentFixture<ListInventoryComponent>;
  let router: Router;

  /**
   * The real Router is kept and only `navigate` is spied on. Substituting a
   * stub Router instead breaks RouterLink, which needs createUrlTree and
   * serializeUrl to resolve a template link -- so a stub would let a broken
   * routerLink pass unnoticed.
   */
  async function create(): Promise<void> {
    TestBed.resetTestingModule();

    const config = new AppConfig();
    config.set('BASE_URL', 'http://localhost:5000');

    await TestBed.configureTestingModule({
      imports: [SharedModule, RouterTestingModule, NoopAnimationsModule],
      declarations: [ListInventoryComponent],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: activatedRouteStub },
        { provide: AppConfig, useValue: config },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);

    fixture = TestBed.createComponent(ListInventoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await create();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('navigation', () => {

    it('edits an item', () => {
      component.onEdit({ id: 5 } as any);

      expect(router.navigate).toHaveBeenCalledWith(['cms/inventory/update-inventory', 5]);
    });

    it('exposes the base path to the template for the Add button', () => {
      expect(component.invBase).toBe('cms/inventory');
    });

    /**
     * The Add and Back links live in the template as routerLink, which is a
     * separate defect from the TypeScript one and was missed by fixing only
     * the navigate() calls.
     *
     * Asserted through the RouterLink directive's resolved UrlTree rather than
     * an href attribute: the control is a <button>, and RouterLink only writes
     * href onto an <a>, so there is no href to read.
     */
    it('resolves the Add link to a real route', () => {
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('button[mat-raised-button]'));
      expect(button).withContext('the Add Inventory control should be present').toBeTruthy();

      const resolved = button.injector.get(RouterLink).urlTree?.toString();

      expect(resolved).toBe('/cms/inventory/add-inventory');
    });

    it('never links under the old product path', () => {
      // A literal '/hms' surviving in any template is a 404 with no error,
      // which is exactly how this broke before.
      const source = fixture.nativeElement.innerHTML as string;
      expect(source).not.toContain('/hms');
    });
  });
});
