import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PageEvent } from '@angular/material/paginator';
import { finalize } from 'rxjs/operators';

import { CustomSnackbarService } from '../../shared/custom-snackbar/custom-snackbar.service';
import { IEntityResponse } from '../../models/ICommon.model';
import { IAuditLog } from '../models/platform.model';
import { PlatformAuditService } from '../services/platform-audit.service';

/** One selectable verb in the action filter. Kept in step with the writers:
 * `tenant_management_service` and `super_admin_user_service`. */
interface IActionOption {
  value: string;
  label: string;
  tone: string;
}

const ACTION_OPTIONS: IActionOption[] = [
  { value: 'CREATE_TENANT', label: 'Created tenant', tone: 'success' },
  { value: 'UPDATE_TENANT', label: 'Updated tenant', tone: 'neutral' },
  { value: 'ACTIVATE_TENANT', label: 'Activated tenant', tone: 'success' },
  { value: 'DEACTIVATE_TENANT', label: 'Deactivated tenant', tone: 'warn' },
  { value: 'ARCHIVE_TENANT', label: 'Archived tenant', tone: 'amber' },
  { value: 'RESTORE_TENANT', label: 'Restored tenant', tone: 'neutral' },
  { value: 'CREATE_SUPER_ADMIN', label: 'Created administrator', tone: 'success' },
  { value: 'UPDATE_SUPER_ADMIN', label: 'Updated administrator', tone: 'neutral' },
  { value: 'ACTIVATE_SUPER_ADMIN', label: 'Activated administrator', tone: 'success' },
  { value: 'DEACTIVATE_SUPER_ADMIN', label: 'Deactivated administrator', tone: 'warn' },
  { value: 'RESET_SUPER_ADMIN_PASSWORD', label: 'Reset administrator password', tone: 'amber' },
];

const ENTITY_OPTIONS = [
  { value: 'tenant', label: 'Tenant' },
  { value: 'super_admin', label: 'Administrator' },
];

/**
 * The platform activity feed: the reader for the audit trail every management
 * action writes.
 *
 * Global and newest-first, optionally narrowed by verb, entity or date. The
 * `details` column is the writer's own JSON, shown verbatim rather than re-parsed
 * into a shape the UI would then have to keep in step with each verb.
 */
@Component({
  selector: 'app-platform-activity',
  templateUrl: './activity.component.html',
  styleUrl: './activity.component.scss',
})
export class PlatformActivityComponent {

  private _audit = inject(PlatformAuditService);
  private _snackbar = inject(CustomSnackbarService);
  private _route = inject(ActivatedRoute);

  readonly actionOptions = ACTION_OPTIONS;
  readonly entityOptions = ENTITY_OPTIONS;

  readonly displayedColumns = ['created_at', 'actor_email', 'action', 'entity', 'details'];

  logs: IAuditLog[] = [];
  totalRecords = 0;
  pageSize = 15;
  pageIndex = 0;

  actionFilter = '';
  entityFilter = '';
  /** A specific row id, used to show one tenant's or one admin's history. Kept
   * as text so an in-progress entry never throws; only a clean integer is sent. */
  entityIdFilter = '';
  dateFrom = '';
  dateTo = '';

  isLoading = false;

  get isRefreshing(): boolean {
    return this.isLoading && this.logs.length > 0;
  }

  ngOnInit(): void {
    // Filters can arrive from the query string -- the tenant edit screen links
    // here pre-scoped to its own tenant -- so honour whatever was provided.
    const params = this._route.snapshot.queryParamMap;
    this.entityFilter = params.get('entity_type') ?? '';
    this.actionFilter = params.get('action') ?? '';
    const entityId = params.get('entity_id');
    this.entityIdFilter = entityId && /^\d+$/.test(entityId) ? entityId : '';
    this.load();
  }

  load(): void {
    const entityId = this.entityIdFilter.trim();
    this.isLoading = true;
    this._audit.list({
      page_size: this.pageSize,
      page_number: this.pageIndex + 1,
      action: this.actionFilter || undefined,
      entity_type: this.entityFilter || undefined,
      entity_id: entityId && /^\d+$/.test(entityId) ? Number(entityId) : undefined,
      date_from: this.dateFrom ? `${this.dateFrom}T00:00:00` : undefined,
      // Inclusive of the chosen day: the bare date would parse as midnight and
      // silently drop everything that happened during it.
      date_to: this.dateTo ? `${this.dateTo}T23:59:59` : undefined,
    })
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: (resp: IEntityResponse) => {
          this.logs = (resp?.data as IAuditLog[]) ?? [];
          this.totalRecords = resp?.meta?.total_records ?? 0;
        },
        error: (err) => {
          this.logs = [];
          this.totalRecords = 0;
          this._snackbar.openSnackBar(err?.error?.message || 'Could not load activity.', 'error');
        },
      });
  }

  applyFilters(): void {
    this.pageIndex = 0;
    this.load();
  }

  clearFilters(): void {
    this.actionFilter = '';
    this.entityFilter = '';
    this.entityIdFilter = '';
    this.dateFrom = '';
    this.dateTo = '';
    this.pageIndex = 0;
    this.load();
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.load();
  }

  /** Human label for a verb, falling back to the raw action so a new one is
   * legible before this list is updated. */
  actionLabel(action: string): string {
    return this.actionOptions.find((option) => option.value === action)?.label ?? action;
  }

  actionTone(action: string): string {
    return this.actionOptions.find((option) => option.value === action)?.tone ?? 'neutral';
  }

  entityLabel(log: IAuditLog): string {
    const type = log.entity_type === 'tenant' ? 'Tenant' : 'Administrator';
    return log.entity_id != null ? `${type} #${log.entity_id}` : type;
  }

  /** Pretty-print the stored JSON for readability; leave anything unparseable
   * as-is rather than hiding it. */
  prettyDetails(details: string | null): string {
    if (!details) {
      return '—';
    }
    try {
      return JSON.stringify(JSON.parse(details), null, 2);
    } catch {
      return details;
    }
  }
}
