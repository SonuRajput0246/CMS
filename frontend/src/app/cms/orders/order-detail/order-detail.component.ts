import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';

import { INavigationaBar } from '../../../models/ICommon.model';
import { IOrderDetail } from '../../../models/ICms.model';
import { CmsOrderService } from '../../../services/cms/order.service';
import { CustomSnackbarService } from '../../../shared/custom-snackbar/custom-snackbar.service';

/**
 * Read-only order detail on its own route, so the bill can stay open in a
 * tab (and be shared) while the cashier works elsewhere in the console.
 */
@Component({
  selector: 'app-order-detail',
  standalone: false,
  templateUrl: './order-detail.component.html',
  styleUrl: './order-detail.component.scss'
})
export class OrderDetailPageComponent implements OnInit {

  private _orderService = inject(CmsOrderService);
  private _snackbar = inject(CustomSnackbarService);
  private _router = inject(Router);
  private _route = inject(ActivatedRoute);

  private readonly listRoute = '/cms/orders';

  navData: INavigationaBar[] = [
    { displayValue: 'Home', isClickable: true, isDashboard: false, redirectValue: '/cms/dashboard' },
    { displayValue: 'Order Management', isClickable: true, isDashboard: false, redirectValue: this.listRoute },
    { displayValue: 'Order Details', isClickable: false, isDashboard: false }
  ];

  order: IOrderDetail | null = null;
  isPageLoad = false;
  loadFailed = false;

  ngOnInit(): void {
    const orderId = Number(this._route.snapshot.paramMap.get('id'));
    if (!orderId) {
      this.loadFailed = true;
      return;
    }
    this.loadOrder(orderId);
  }

  private loadOrder(orderId: number): void {
    this.isPageLoad = true;
    this._orderService.getOrderById(orderId)
      .pipe(finalize(() => this.isPageLoad = false))
      .subscribe({
        next: (res) => {
          if (res?.status && res.data) {
            this.order = res.data as IOrderDetail;
            this.navData[2] = {
              displayValue: this.order.order_number,
              isClickable: false,
              isDashboard: false
            };
          } else {
            this.loadFailed = true;
            this._snackbar.openSnackBar(res?.message || 'Failed to load the order', 'error');
          }
        },
        error: (err) => {
          this.loadFailed = true;
          const msg = err?.status === 404
            ? 'This order no longer exists.'
            : (err?.error?.message || 'An error occurred while loading the order');
          this._snackbar.openSnackBar(msg, 'error');
        }
      });
  }

  goBack(): void {
    this._router.navigate([this.listRoute]);
  }

  printBill(): void {
    if (!this.order?.id) {
      return;
    }

    this._orderService.getBill(this.order.id).subscribe({
      next: (res) => {
        if (res?.status && res.data) {
          this.openPrintWindow(res.data);
        } else {
          this._snackbar.openSnackBar(res?.message || 'Failed to load the bill', 'error');
        }
      },
      error: (err) => this._snackbar.openSnackBar(
        err?.error?.message || 'Failed to load the bill', 'error'
      )
    });
  }

  private openPrintWindow(bill: any): void {
    const printHtml = this.generateBillHtml(bill);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printHtml);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 250);
    }
  }

  private generateBillHtml(bill: any): string {
    const itemsHtml = bill.items?.map((item: any) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${item.item_name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">₹ ${Number(item.unit_price).toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">₹ ${Number(item.total_price).toFixed(2)}</td>
      </tr>
    `).join('') || '';

    const paymentsHtml = bill.payments?.map((p: any) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${p.payment_method}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">₹ ${Number(p.amount).toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${p.paid_at ? new Date(p.paid_at).toLocaleString() : '-'}</td>
      </tr>
    `).join('') || '';

    return `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 20px; }
            .details { margin-bottom: 20px; }
            .details div { margin: 4px 0; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { padding: 8px; text-align: left; border-bottom: 1px solid #e2e8f0; }
            th { background: #f2f6fc; font-weight: 600; }
            .totals { text-align: right; margin-top: 20px; }
            .total-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
            .grand-total { font-weight: bold; font-size: 1.1em; border-top: 2px solid #003366; }
            .footer { text-align: center; margin-top: 30px; color: #64748b; font-size: 0.9em; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body onload="window.print()">
          <div class="header">
            <h2>${bill.table?.table_name || 'Walk-in'}</h2>
            <p>Order: ${bill.order_number} | ${bill.reference_label}</p>
          </div>
          <div class="details">
            <div><strong>Ordered:</strong> ${bill.ordered_at ? new Date(bill.ordered_at).toLocaleString() : '-'}</p>
            <div><strong>Type:</strong> ${bill.order_type}</div>
          </div>
          <table>
            <thead>
              <tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>
          <div class="totals">
            <div class="total-row"><span>Subtotal:</span><span>₹ ${bill.totals.item_subtotal}</span></div>
            <div class="total-row"><span>Tax:</span><span>₹ ${bill.totals.tax_amount}</span></div>
            <div class="total-row"><span>Discount:</span><span>₹ ${bill.totals.discount_amount}</span></div>
            <div class="total-row grand-total"><span>Total:</span><span>₹ ${bill.totals.total_amount}</span></div>
          </div>
          <table style="width:100%; margin-top:20px;">
            <thead><tr><th>Method</th><th style="text-align:right">Amount</th><th>Time</th></tr></thead>
            <tbody>${paymentsHtml}</tbody>
          </table>
          <div class="footer">Thank you for visiting!</div>
        </body>
      </html>
    `;
  }
}
