import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';

import { INavigationaBar } from '../../../models/ICommon.model';
import { ITable, ITableZone } from '../../../models/ICms.model';
import { CmsFloorService } from '../../../services/cms/floor.service';
import { CustomSnackbarService } from '../../../shared/custom-snackbar/custom-snackbar.service';

/**
 * Add / edit a table on its own route.
 *
 * Status is deliberately absent: occupancy belongs to the order lifecycle and
 * the manual status flip stays on the list row (Change Status). See
 * TableListComponent.settableStatuses.
 */
@Component({
  selector: 'app-manage-table',
  templateUrl: './manage-table.component.html',
  styleUrls: ['../table-form-page.scss']
})
export class ManageTableComponent implements OnInit {

  private _floorService = inject(CmsFloorService);
  private _snackbar = inject(CustomSnackbarService);
  private _router = inject(Router);
  private _route = inject(ActivatedRoute);
  private _fb = inject(FormBuilder);

  private readonly listRoute = '/cms/tables';

  /// Mirrors TABLE_SHAPES in table_schema.py -- square / round / rectangle.
  readonly tableShapes = ['square', 'round', 'rectangle'];

  navData: INavigationaBar[] = [];
  tableForm!: FormGroup;
  zoneList: ITableZone[] = [];

  editingTable: ITable | null = null;
  isEditMode = false;
  isPageLoad = false;
  isSaving = false;

  ngOnInit(): void {
    this.initNavigation();
    this.createForm();
    this.loadZones();

    const tableId = Number(this._route.snapshot.paramMap.get('id'));
    if (tableId) {
      this.loadTable(tableId);
    }
  }

  private initNavigation(): void {
    this.navData = [
      { displayValue: 'Home', isClickable: true, isDashboard: false, redirectValue: '/cms/dashboard' },
      { displayValue: 'CMS', isClickable: false, isDashboard: false },
      { displayValue: 'Table Management', isClickable: true, isDashboard: false, redirectValue: this.listRoute },
      {
        displayValue: this._route.snapshot.data['breadcrumb'] || 'Add Table',
        isClickable: false,
        isDashboard: false
      }
    ];
  }

  private createForm(): void {
    this.tableForm = this._fb.group({
      table_number: ['', [Validators.required, Validators.maxLength(20)]],
      table_name: ['', Validators.maxLength(50)],
      capacity: [2, [Validators.required, Validators.min(1), Validators.max(50)]],
      zone_id: [null],
      shape: ['square'],
      is_combinable: [true],
      is_active: [true]
    });
  }

  /**
   * Zones for the picker. A failure here leaves the select showing
   * "Unassigned"; the table can still be saved, so it is reported but not
   * treated as a page-blocking error.
   */
  private loadZones(): void {
    this._floorService.getZones({ page_number: 1, page_size: 200, search_value: '' })
      .subscribe({
        next: (res) => {
          if (res?.status) {
            this.zoneList = res.data || [];
          } else {
            this._snackbar.openSnackBar(res?.message || 'Failed to fetch zones', 'error');
          }
        },
        error: (err) => this._snackbar.openSnackBar(
          err?.error?.message || 'An error occurred while fetching zones', 'error'
        )
      });
  }

  private loadTable(tableId: number): void {
    this.isPageLoad = true;
    this._floorService.getTableById(tableId)
      .pipe(finalize(() => this.isPageLoad = false))
      .subscribe({
        next: (res) => {
          if (!res?.status || !res.data) {
            this._snackbar.openSnackBar(res?.message || 'Failed to load the table', 'error');
            return;
          }

          this.isEditMode = true;
          const table = res.data as ITable;
          this.editingTable = table;
          this.tableForm.patchValue({
            table_number: table.table_number || '',
            table_name: table.table_name || '',
            capacity: table.capacity ?? 2,
            zone_id: table.zone_id ?? null,
            shape: table.shape || 'square',
            is_combinable: table.is_combinable ?? true,
            is_active: table.is_active ?? true
          });
        },
        error: (err) => {
          const msg = err?.status === 404
            ? 'This table no longer exists.'
            : (err?.error?.message || 'An error occurred while loading the table');
          this._snackbar.openSnackBar(msg, 'error');
        }
      });
  }

  saveTable(): void {
    if (this.tableForm.invalid) {
      this.tableForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    const value = this.tableForm.value;

    /**
     * is_deleted is required by the upsert schema on every write, so an update
     * must explicitly say "still live" -- this codebase soft-deletes through
     * the same payload.
     */
    const payload = {
      id: this.editingTable?.id || 0,
      table_number: value.table_number,
      table_name: value.table_name || null,
      capacity: value.capacity,
      zone_id: value.zone_id || null,
      shape: value.shape || null,
      is_combinable: !!value.is_combinable,
      is_active: !!value.is_active,
      is_deleted: false
    };

    this._floorService.upsertTable(payload)
      .pipe(finalize(() => this.isSaving = false))
      .subscribe({
        next: (res) => {
          if (res?.status) {
            this._snackbar.openSnackBar(res.message || 'Table saved successfully', 'success');
            this._router.navigate([this.listRoute]);
          } else {
            this._snackbar.openSnackBar(res?.message || 'Failed to save the table', 'error');
          }
        },
        error: (err) => this._snackbar.openSnackBar(
          err?.error?.message || 'An error occurred while saving the table', 'error'
        )
      });
  }

  goBack(): void {
    this._router.navigate([this.listRoute]);
  }
}
