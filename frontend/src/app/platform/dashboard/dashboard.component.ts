import { Component, inject } from '@angular/core';
import { finalize } from 'rxjs/operators';

import { CustomSnackbarService } from '../../shared/custom-snackbar/custom-snackbar.service';
import { IEntityResponse } from '../../models/ICommon.model';
import { ITenantSummary } from '../models/platform.model';
import { PlatformTenantService } from '../services/platform-tenant.service';

interface ISummaryCard {
  key: keyof ITenantSummary;
  label: string;
  icon: string;
  tone: string;
}

/**
 * Platform-wide totals. The numbers span every tenant because the request has
 * none bound -- that is the point of the screen, not a filter that failed.
 */
@Component({
  selector: 'app-platform-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class PlatformDashboardComponent {

  private _tenants = inject(PlatformTenantService);
  private _snackbar = inject(CustomSnackbarService);

  isLoading = false;
  summary: ITenantSummary | null = null;

  readonly cards: ISummaryCard[] = [
    { key: 'total_tenants', label: 'Total tenants', icon: 'storefront', tone: 'neutral' },
    { key: 'active_tenants', label: 'Active', icon: 'check_circle', tone: 'positive' },
    { key: 'inactive_tenants', label: 'Inactive', icon: 'pause_circle', tone: 'warn' },
    { key: 'archived_tenants', label: 'Archived', icon: 'archive', tone: 'muted' },
    { key: 'total_users', label: 'Users', icon: 'group', tone: 'neutral' },
  ];

  ngOnInit(): void {
    this.loadSummary();
  }

  loadSummary(): void {
    this.isLoading = true;
    this._tenants.summary()
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: (resp: IEntityResponse) => {
          this.summary = (resp?.data as ITenantSummary) ?? null;
        },
        error: (err) => {
          this._snackbar.openSnackBar(
            err?.error?.message || 'Could not load the summary.',
            'error'
          );
        },
      });
  }

  value(key: keyof ITenantSummary): number {
    return this.summary ? this.summary[key] : 0;
  }
}
