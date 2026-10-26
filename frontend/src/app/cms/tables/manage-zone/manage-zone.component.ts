import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';

import { INavigationaBar } from '../../../models/ICommon.model';
import { ITableZone } from '../../../models/ICms.model';
import { CmsFloorService } from '../../../services/cms/floor.service';
import { CustomSnackbarService } from '../../../shared/custom-snackbar/custom-snackbar.service';

/**
 * Add / edit a floor zone on its own route.
 *
 * Saving and cancelling return to the table screen with the Zones tab
 * selected, so the operator lands back where the change is visible.
 */
@Component({
  selector: 'app-manage-zone',
  templateUrl: './manage-zone.component.html',
  styleUrls: ['../table-form-page.scss']
})
export class ManageZoneComponent implements OnInit {

  private _floorService = inject(CmsFloorService);
  private _snackbar = inject(CustomSnackbarService);
  private _router = inject(Router);
  private _route = inject(ActivatedRoute);
  private _fb = inject(FormBuilder);

  private readonly listRoute = '/cms/tables';
  private readonly zonesTabQuery = { tab: 'zones' };

  navData: INavigationaBar[] = [];
  zoneForm!: FormGroup;

  editingZone: ITableZone | null = null;
  isEditMode = false;
  isPageLoad = false;
  isSaving = false;

  ngOnInit(): void {
    this.initNavigation();
    this.createForm();

    const zoneId = Number(this._route.snapshot.paramMap.get('id'));
    if (zoneId) {
      this.loadZone(zoneId);
    } else {
      this.prefillDisplayOrder();
    }
  }

  private initNavigation(): void {
    this.navData = [
      { displayValue: 'Home', isClickable: true, isDashboard: false, redirectValue: '/cms/dashboard' },
      { displayValue: 'CMS', isClickable: false, isDashboard: false },
      {
        displayValue: 'Table Management',
        isClickable: true,
        isDashboard: false,
        redirectValue: `${this.listRoute}?tab=zones`
      },
      {
        displayValue: this._route.snapshot.data['breadcrumb'] || 'Add Zone',
        isClickable: false,
        isDashboard: false
      }
    ];
  }

  private createForm(): void {
    this.zoneForm = this._fb.group({
      name: ['', [Validators.required, Validators.maxLength(50)]],
      display_name: ['', [Validators.required, Validators.maxLength(50)]],
      description: ['', Validators.maxLength(255)],
      display_order: [0, [Validators.min(0)]],
      is_active: [true]
    });
  }

  /**
   * New zones land at the end of the floor ordering by default. The highest
   * existing order is only a convenience prefill -- if it fails, zero is
   * still valid.
   */
  private prefillDisplayOrder(): void {
    this._floorService.getZones({ page_number: 1, page_size: 200, search_value: '' })
      .subscribe({
        next: (res) => {
          if (!res?.status || this.zoneForm.dirty) return;
          const zones: ITableZone[] = res.data || [];
          const lastOrder = zones.reduce(
            (max: number, zone: ITableZone) => Math.max(max, zone.display_order ?? 0),
            0
          );
          this.zoneForm.patchValue({ display_order: zones.length ? lastOrder + 1 : 0 });
        },
        error: () => { /* keep the default order */ }
      });
  }

  private loadZone(zoneId: number): void {
    this.isPageLoad = true;
    this._floorService.getZoneById(zoneId)
      .pipe(finalize(() => this.isPageLoad = false))
      .subscribe({
        next: (res) => {
          if (!res?.status || !res.data) {
            this._snackbar.openSnackBar(res?.message || 'Failed to load the zone', 'error');
            return;
          }

          this.isEditMode = true;
          const zone = res.data as ITableZone;
          this.editingZone = zone;
          this.zoneForm.patchValue({
            name: zone.name || '',
            display_name: zone.display_name || '',
            description: zone.description || '',
            display_order: zone.display_order ?? 0,
            is_active: zone.is_active ?? true
          });
        },
        error: (err) => {
          const msg = err?.status === 404
            ? 'This zone no longer exists.'
            : (err?.error?.message || 'An error occurred while loading the zone');
          this._snackbar.openSnackBar(msg, 'error');
        }
      });
  }

  saveZone(): void {
    if (this.zoneForm.invalid) {
      this.zoneForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    const value = this.zoneForm.value;

    const payload = {
      id: this.editingZone?.id || 0,
      name: value.name,
      display_name: value.display_name,
      description: value.description || null,
      display_order: value.display_order || 0,
      is_active: !!value.is_active,
      is_deleted: false
    };

    this._floorService.upsertZone(payload)
      .pipe(finalize(() => this.isSaving = false))
      .subscribe({
        next: (res) => {
          if (res?.status) {
            this._snackbar.openSnackBar(res.message || 'Zone saved successfully', 'success');
            this._router.navigate([this.listRoute], { queryParams: this.zonesTabQuery });
          } else {
            this._snackbar.openSnackBar(res?.message || 'Failed to save the zone', 'error');
          }
        },
        error: (err) => this._snackbar.openSnackBar(
          err?.error?.message || 'An error occurred while saving the zone', 'error'
        )
      });
  }

  goBack(): void {
    this._router.navigate([this.listRoute], { queryParams: this.zonesTabQuery });
  }
}
