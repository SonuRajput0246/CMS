import { Component, inject, OnInit } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginatorSelectConfig } from '@angular/material/paginator';
import { finalize } from 'rxjs/operators';

import { ISearchRequest, IGenricGrid, INavigationaBar } from '../../../models/ICommon.model';
import { IOrderSummary } from '../../../models/ICms.model';
import { CmsOrderService } from '../../../services/cms/order.service';
import { CustomSnackbarService } from '../../../shared/custom-snackbar/custom-snackbar.service';
import { ConfirmationService } from '../../../services/confirmation.service';
import { Router } from '@angular/router';
import { PAGE_SIZE_SELECT_CONFIG } from '../../../shared/paginator-config';

@Component({
  selector: 'app-order-list',
  standalone: false,
  templateUrl: './order-list.component.html',
  styleUrl: './order-list.component.scss'
})
export class OrderListComponent implements OnInit {
  private _orderService = inject(CmsOrderService);
  private _snackbar = inject(CustomSnackbarService);
  private _confirmService = inject(ConfirmationService);
  private _router = inject(Router);

  // State
  isPageLoad = false;
  searchValue = '';
  orderList: IOrderSummary[] = [];
  pageDet: IGenricGrid = { total_docs: 0, limit: 10 };
  displayedColumns: string[] = ['sr', 'order_number', 'reference_label', 'ordered_at', 'item_count', 'total_amount', 'payment_status', 'status', 'actions'];
  dataSource = new MatTableDataSource<IOrderSummary>();

  /// Same page-size trigger and option list as the other CMS list pages.
  readonly pageSizeSelect: MatPaginatorSelectConfig = PAGE_SIZE_SELECT_CONFIG;

  get totalPages(): number {
    return this.pageDet.total_docs > 0
      ? Math.ceil(this.pageDet.total_docs / this.pageDet.limit)
      : 1;
  }

  get currentPageIndex(): number {
    return (this.requestData.page_number || 1) - 1;
  }

  navData: INavigationaBar[] = [
    { displayValue: 'Home', isClickable: true, isDashboard: false, redirectValue: '/cms/dashboard' },
    { displayValue: 'Order Management', isClickable: false, isDashboard: false }
  ];

  requestData: ISearchRequest = {
    page_number: 1,
    page_size: 10,
    search_value: ''
  } as ISearchRequest;

  // Filters
  statusFilter = '';
  paymentStatusFilter = '';
  tableIdFilter: number | null = null;
  customerIdFilter: number | null = null;
  fromDate: Date | null = null;
  toDate: Date | null = null;

  ORDER_STATUSES = [
    'pending', 'confirmed', 'preparing', 'ready', 'served', 'cancelled', 'completed'
  ];
  PAYMENT_STATUSES = ['pending', 'partial', 'paid', 'refunded', 'failed'];

  ngOnInit(): void {
    this.loadInitialData();
  }

  private loadInitialData(): void {
    this.fetchOrderList();
  }

  private fetchOrderList(): void {
    this.isPageLoad = true;

    const payload: any = {
      page_number: this.requestData.page_number,
      page_size: this.requestData.page_size,
      search_value: this.searchValue || null,
      status: this.statusFilter || null,
      payment_status: this.paymentStatusFilter || null,
      table_id: this.tableIdFilter,
      customer_id: this.customerIdFilter,
      from_date: this.fromDate ? this.formatDate(this.fromDate) : null,
      to_date: this.toDate ? this.formatDate(this.toDate) : null
    };

    this._orderService.getOrders(payload)
      .pipe(finalize(() => this.isPageLoad = false))
      .subscribe({
        next: (res) => {
          if (res?.status) {
            this.orderList = res.data || [];
            this.pageDet.total_docs = res.meta?.total_records || 0;
            this.pageDet.limit = this.requestData.page_size!;
            this.dataSource.data = this.orderList;

            // Deleting/cancelling the last row on a page can leave the
            // operator on an empty page; step back like the other lists.
            if (this.orderList.length === 0 && (this.requestData.page_number || 1) > 1) {
              this.requestData.page_number!--;
              this.fetchOrderList();
            }
          } else {
            this._snackbar.openSnackBar(res?.message || 'Failed to fetch orders', 'error');
          }
        },
        error: (err) => {
          const msg = err.error?.message || 'An error occurred while fetching orders';
          this._snackbar.openSnackBar(msg, 'error');
        }
      });
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  onPaginateChange(e: any): void {
    this.requestData.page_number = e.pageIndex + 1;
    this.requestData.page_size = e.pageSize;
    this.fetchOrderList();
  }

  applyFilter(): void {
    if (this.searchValue.length >= 3 || this.searchValue.length === 0) {
      this.requestData.page_number = 1;
      this.fetchOrderList();
    }
  }

  clearFilter(): void {
    this.searchValue = '';
    this.statusFilter = '';
    this.paymentStatusFilter = '';
    this.tableIdFilter = null;
    this.customerIdFilter = null;
    this.fromDate = null;
    this.toDate = null;
    this.requestData.page_number = 1;
    this.fetchOrderList();
  }

  onStatusFilterChange(): void {
    this.requestData.page_number = 1;
    this.fetchOrderList();
  }

  onPaymentStatusFilterChange(): void {
    this.requestData.page_number = 1;
    this.fetchOrderList();
  }

  onDateFilterChange(): void {
    this.requestData.page_number = 1;
    this.fetchOrderList();
  }

  /// Row click and the row menu both open the routed detail page.
  onRowClick(order: IOrderSummary): void {
    this._router.navigate(['/cms/orders/view', order.id]);
  }

  onCancelOrder(order: any): void {
    this._confirmService.confirmWithReason(
      'Cancel Order',
      `Are you sure you want to cancel order ${order.order_number}?`
    ).then((result) => {
      if (result.confirmed) {
        this.isPageLoad = true;
        this._orderService.cancelOrder(order.id, result.reason)
          .pipe(finalize(() => this.isPageLoad = false))
          .subscribe({
            next: (res) => {
              if (res?.status) {
                this._snackbar.openSnackBar(res.message || 'Order cancelled successfully', 'success');
                this.fetchOrderList();
              } else {
                this._snackbar.openSnackBar(res?.message || 'Failed to cancel order', 'error');
              }
            },
            error: (err) => {
              const msg = err.error?.message || 'Failed to cancel order';
              this._snackbar.openSnackBar(msg, 'error');
            }
          });
      }
    });
  }

  goToTable(tableId: number): void {
    this._router.navigate(['/cms/pos']);
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'Pending',
      confirmed: 'Confirmed',
      preparing: 'Preparing',
      ready: 'Ready',
      served: 'Served',
      cancelled: 'Cancelled',
      completed: 'Completed'
    };
    return labels[status] || status;
  }

  getPaymentStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'Pending',
      partial: 'Partial',
      paid: 'Paid',
      refunded: 'Refunded',
      failed: 'Failed'
    };
    return labels[status] || status;
  }

  getStatusClass(status: string): string {
    const classes: Record<string, string> = {
      pending: 'st-pending',
      confirmed: 'st-confirmed',
      preparing: 'st-preparing',
      ready: 'st-ready',
      served: 'st-served',
      cancelled: 'st-cancelled',
      completed: 'st-completed'
    };
    return classes[status] || 'st-default';
  }

  getPaymentStatusClass(status: string): string {
    const classes: Record<string, string> = {
      pending: 'st-pending',
      partial: 'st-partial',
      paid: 'st-paid',
      refunded: 'st-refunded',
      failed: 'st-failed'
    };
    return classes[status] || 'st-default';
  }
}