import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { AppConfig } from '../../core/config/config';
import { IEntityResponse } from '../../models/ICommon.model';
import { ReportRange } from '../../models/ICms.model';

/**
 * A report window, not just a preset.
 *
 * `custom` additionally needs from_date/to_date; the server rejects it
 * otherwise. Keeping the dates in the same object as the preset makes it
 * impossible to build a custom request that forgets them.
 */
export interface ReportWindow {
  range: ReportRange;
  from_date?: string;
  to_date?: string;
}

/**
 * Reporting.
 *
 * Every endpoint takes the same window, so it is modelled once here and
 * spread onto each request.
 */
@Injectable({ providedIn: 'root' })
export class CmsReportService {

  private http = inject(HttpClient);
  private config = inject(AppConfig);

  private readonly baseURL: string;

  constructor() {
    this.baseURL = this.config.get('BASE_URL');
  }

  private body(rangeWindow: ReportWindow, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { ...rangeWindow, ...extra };
  }

  /**
   * Headline figures plus payment/order-type breakdowns and local-hour buckets.
   *
   * `include_hourly` returns one entry per trading day x 24 hours, so leave it
   * off for a long range where the caller only wants the totals.
   */
  getSalesSummary(rangeWindow: ReportWindow, includeHourly = true, includePaymentBreakdown = true): Observable<IEntityResponse> {
    return this.http.post(`${this.baseURL}/api/v1/report/sales-summary`,
      this.body(rangeWindow, {
        include_hourly: includeHourly,
        include_payment_breakdown: includePaymentBreakdown
      }));
  }

  /**
   * Top sellers.
   *
   * sort_by picks between volume and value -- a cafe's bestseller by quantity
   * is often not its bestseller by margin. include_dead_stock adds active,
   * sellable dishes that sold nothing, which is how you decide what to cut.
   */
  getItemSales(rangeWindow: ReportWindow, data: {
    sort_by?: 'quantity' | 'revenue';
    limit?: number;
    include_dead_stock?: boolean;
    station?: string | null;
  } = {}): Observable<IEntityResponse> {
    return this.http.post(`${this.baseURL}/api/v1/report/item-sales`, this.body(rangeWindow, {
      sort_by: data.sort_by ?? 'quantity',
      limit: data.limit ?? 20,
      include_dead_stock: data.include_dead_stock ?? false,
      station: data.station ?? null
    }));
  }

  /**
   * Revenue per trading day.
   *
   * include_zero_days defaults on server-side: without it a chart draws a
   * straight line across a closed Monday, which reads as steady trade.
   */
  getDailyTrend(rangeWindow: ReportWindow, includeZeroDays = true): Observable<IEntityResponse> {
    return this.http.post(`${this.baseURL}/api/v1/report/daily-trend`,
      this.body(rangeWindow, { include_zero_days: includeZeroDays }));
  }

  /** Voided lines and cancelled orders: loss prevention, grouped by staff. */
  getVoidReport(rangeWindow: ReportWindow, data: { group_by_staff?: boolean; limit?: number } = {}): Observable<IEntityResponse> {
    return this.http.post(`${this.baseURL}/api/v1/report/void-report`, this.body(rangeWindow, {
      group_by_staff: data.group_by_staff ?? true,
      limit: data.limit ?? 100
    }));
  }

  /**
   * Kitchen timings.
   *
   * The average is ordered -> ready, i.e. the GUEST'S wait. It includes queue
   * time behind other tickets, not just cooking time; the response says so in
   * its `note` and it is surfaced in the UI rather than silently relabelled.
   */
  getKitchenPerformance(rangeWindow: ReportWindow, includeByItem = true): Observable<IEntityResponse> {
    return this.http.post(`${this.baseURL}/api/v1/report/kitchen-performance`,
      this.body(rangeWindow, { include_by_item: includeByItem, include_pending: false }));
  }

  /**
   * Regulars and loyalty.
   *
   * top_customers is ranked by LIFETIME spend (that is what should drive a
   * loyalty programme), with period_order_count / period_spend alongside so
   * currently-active customers can be told apart from historical ones.
   */
  getCustomerReport(rangeWindow: ReportWindow, limit = 20): Observable<IEntityResponse> {
    return this.http.post(`${this.baseURL}/api/v1/report/customer-report`,
      this.body(rangeWindow, { limit }));
  }
}