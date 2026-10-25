import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { interval, Subscription } from 'rxjs';

import { INavigationaBar } from '../../../models/ICommon.model';
import { IKdsBoard, IKdsTicket, IPosSummary, ITable } from '../../../models/ICms.model';
import { CmsFloorService } from '../../../services/cms/floor.service';
import { CmsKdsService } from '../../../services/cms/kds.service';
import { CmsOrderService } from '../../../services/cms/order.service';
import { CustomSnackbarService } from '../../../shared/custom-snackbar/custom-snackbar.service';

/**
 * The CMS landing screen: today's trading at a glance.
 *
 * Three reads, deliberately independent so one failing endpoint does not blank
 * the whole page:
 *
 *   * the POS summary (open orders, revenue, average ticket),
 *   * the floor tally (how many tables are free/occupied/...),
 *   * the kitchen queue (the five tickets that have waited longest).
 *
 * The kitchen panel re-polls every 30 seconds. It is the only part of the page
 * that changes while nobody is clicking, and a dashboard whose "waiting 18 min"
 * label was true when the page loaded is worse than no label at all.
 */
@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy {

  private _orderService = inject(CmsOrderService);
  private _floorService = inject(CmsFloorService);
  private _kdsService = inject(CmsKdsService);
  private _snackbar = inject(CustomSnackbarService);
  private _router = inject(Router);

  private _kdsRefreshSub: Subscription | null = null;

  isPageLoad = false;
  summary: IPosSummary | null = null;
  kdsTickets: IKdsTicket[] = [];
  kdsSummary: IKdsBoard['summary'] | null = null;

  /**
   * Floor tallies. Typed loosely because the keys come from a TableStatus
   * union while the values are counts — declaring the full union here would
   * make every `floorCounts?.available` read fail strict index checking
   * when only some keys are guaranteed present.
   */
  floorCounts: Record<string, number> | null = null;

  navData: INavigationaBar[] = [];

  ngOnInit(): void {
    this.initNavigation();
    this.loadDashboardData();
    this.startKdsAutoRefresh();
  }

  ngOnDestroy(): void {
    this._kdsRefreshSub?.unsubscribe();
  }

  private initNavigation(): void {
    this.navData = [
      { displayValue: 'Home', isClickable: true, isDashboard: true, redirectValue: '/cms/dashboard' },
      { displayValue: 'Dashboard', isClickable: false, isDashboard: true }
    ];
  }

  private loadDashboardData(): void {
    this.isPageLoad = true;

    this._orderService.getSummary(true).subscribe({
      next: (res) => {
        if (res?.status) {
          this.summary = res.data;
          this.isPageLoad = false;
        } else {
          this._snackbar.openSnackBar(res?.message || 'Failed to load summary', 'error');
          this.isPageLoad = false;
        }
      },
      error: (err) => {
        this._snackbar.openSnackBar(err.error?.message || 'Failed to load dashboard', 'error');
        this.isPageLoad = false;
      }
    });

    this.loadKdsTickets();
    this.loadFloorCounts();
  }

  /**
   * Tallies the whole floor for the KPI cards.
   *
   * Paged rather than asking for one big page. This used to request
   * `page_size: 1000`, which the schema caps at 500, so the call returned 400
   * on every load and — because the subscribe had no error handler — left the
   * cards showing zero, indistinguishable from a genuinely empty venue.
   *
   * Paging to `meta.last_page` rather than raising the request size keeps the
   * tally exact: a venue with more tables than one page is counted in full
   * instead of quietly undercounting, and the deliberate server-side cap is
   * left alone.
   */
  private loadFloorCounts(): void {
    const pageSize = 500;

    this._floorService.getTables({ page_size: pageSize, page_number: 1 }).subscribe({
      next: (res) => {
        if (!res?.status) {
          this._snackbar.openSnackBar(res?.message || 'Failed to load floor', 'error');
          return;
        }

        const rows: ITable[] = res.data ?? [];
        const lastPage = Number(res.meta?.last_page ?? 1);

        if (lastPage <= 1) {
          this.floorCounts = this.calculateFloorCounts(rows);
          return;
        }

        let collected = [...rows];
        const pending: number[] = [];
        for (let page = 2; page <= lastPage; page++) {
          pending.push(page);
        }

        // Sequential rather than forkJoin: a venue large enough to need several
        // pages should not have every page requested at once, and one failed
        // page degrades to a partial count with a warning instead of discarding
        // the pages that did load.
        const nextPage = () => {
          const page = pending.shift();
          if (page === undefined) {
            this.floorCounts = this.calculateFloorCounts(collected);
            return;
          }
          this._floorService.getTables({ page_size: pageSize, page_number: page }).subscribe({
            next: (more) => {
              if (more?.status) {
                collected = collected.concat(more.data ?? []);
              } else {
                this._snackbar.openSnackBar(
                  more?.message || 'Failed to load part of the floor', 'error');
              }
              nextPage();
            },
            error: () => {
              this._snackbar.openSnackBar('Failed to load part of the floor', 'error');
              nextPage();
            }
          });
        };
        nextPage();
      },
      error: (err) => {
        this._snackbar.openSnackBar(err.error?.message || 'Failed to load floor', 'error');
      }
    });
  }

  private loadKdsTickets(): void {
    this._kdsService.getTickets({ order_by: 'oldest_first' }).subscribe({
      next: (res) => {
        if (res?.status) {
          this.kdsTickets = res.data.tickets || [];
          this.kdsSummary = res.data.summary;
        }
      },
      // The panel re-polls every 30s, so a transient failure is not worth a
      // snackbar per refresh. Keeping the last known queue is also better than
      // blanking it: an empty board reads as "kitchen is clear", which is the
      // opposite of what a failed poll means.
      error: () => { }
    });
  }

  private startKdsAutoRefresh(): void {
    this._kdsRefreshSub = interval(30000).subscribe(() => {
      this.loadKdsTickets();
    });
  }

  /**
   * Tallies tables by status for the KPI cards.
   *
   * Record<string, number> rather than a fixed shape: the server may add a
   * table status, and an unknown one should still be counted rather than
   * tripping an index-signature error at compile time.
   */
  private calculateFloorCounts(tables: ITable[]): Record<string, number> {
    const counts: Record<string, number> = {
      available: 0, occupied: 0, reserved: 0, cleaning: 0, maintenance: 0, total: 0
    };

    for (const table of tables ?? []) {
      const status = table?.status;
      if (status && counts.hasOwnProperty(status)) {
        counts[status]++;
      }
      counts['total']++;
    }

    return counts;
  }

  navigateTo(route: string): void {
    this._router.navigate([route]);
  }

  getWaitColor(minutes: number | undefined): string {
    if (!minutes) return '';
    if (minutes >= 20) return 'danger';
    if (minutes >= 10) return 'warn';
    return '';
  }
}
