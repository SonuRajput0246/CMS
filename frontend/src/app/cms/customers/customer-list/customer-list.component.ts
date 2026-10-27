import { Component, inject, OnInit, Inject } from '@angular/core';
import { MatPaginatorSelectConfig } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';

import { ISearchRequest, IGenricGrid, INavigationaBar } from '../../../models/ICommon.model';
import { ICustomer } from '../../../models/ICms.model';
import { CmsCustomerService } from '../../../services/cms/customer.service';
import { CustomSnackbarService } from '../../../shared/custom-snackbar/custom-snackbar.service';
import { ConfirmationService } from '../../../services/confirmation.service';
import { PAGE_SIZE_SELECT_CONFIG } from '../../../shared/paginator-config';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  selector: 'app-customer-list',
  standalone: false,
  templateUrl: './customer-list.component.html',
  styleUrl: './customer-list.component.scss'
})
export class CustomerListComponent implements OnInit {
  private _customerService = inject(CmsCustomerService);
  private _snackbar = inject(CustomSnackbarService);
  private _confirmService = inject(ConfirmationService);
  private _dialog = inject(MatDialog);
  private _router = inject(Router);

  isPageLoad = false;
  searchValue = '';
  customerList: ICustomer[] = [];
  pageDet: IGenricGrid = { total_docs: 0, limit: 10 };
  displayedColumns: string[] = ['sr', 'customer_code', 'name', 'phone', 'tier', 'loyalty_points', 'total_visits', 'total_spent', 'last_visit_at', 'is_vip', 'is_active', 'actions'];
  dataSource = new MatTableDataSource<ICustomer>();

  requestData: ISearchRequest = {
    page_number: 1,
    page_size: 10,
    search_value: ''
  } as ISearchRequest;

  isVipFilter: boolean | null = null;

  /// Same page-size trigger and option list as every other CMS list page.
  readonly pageSizeSelect: MatPaginatorSelectConfig = PAGE_SIZE_SELECT_CONFIG;

  get totalPages(): number {
    return this.pageDet.total_docs > 0
      ? Math.ceil(this.pageDet.total_docs / (this.requestData.page_size || 10))
      : 1;
  }

  navData: INavigationaBar[] = [
    { displayValue: 'Home', isClickable: true, isDashboard: false, redirectValue: '/cms/dashboard' },
    { displayValue: 'Customer Management', isClickable: false, isDashboard: false }
  ];

  ngOnInit(): void {
    this.loadInitialData();
  }

  private loadInitialData(): void {
    this.fetchCustomerList();
  }

  private fetchCustomerList(): void {
    this.isPageLoad = true;

    const payload: any = {
      page_number: this.requestData.page_number,
      page_size: this.requestData.page_size,
      search_value: this.searchValue || null,
      is_vip: this.isVipFilter === null ? null : this.isVipFilter
    };

    this._customerService.getCustomers(payload)
      .pipe(finalize(() => this.isPageLoad = false))
      .subscribe({
        next: (res) => {
          if (res?.status) {
            this.customerList = res.data || [];
            this.pageDet.total_docs = res.meta?.total_records || 0;
            this.pageDet.limit = this.requestData.page_size!;
            this.dataSource.data = this.customerList;
          } else {
            this._snackbar.openSnackBar(res?.message || 'Failed to fetch customers', 'error');
          }
        },
        error: (err) => {
          const msg = err.error?.message || 'An error occurred while fetching customers';
          this._snackbar.openSnackBar(msg, 'error');
        }
      });
  }

  onPaginateChange(e: any): void {
    this.requestData.page_number = e.pageIndex + 1;
    this.requestData.page_size = e.pageSize;
    this.fetchCustomerList();
  }

  applyFilter(): void {
    if (this.searchValue.length >= 3 || this.searchValue.length === 0) {
      this.requestData.page_number = 1;
      this.fetchCustomerList();
    }
  }

  clearFilter(): void {
    this.searchValue = '';
    this.isVipFilter = null;
    this.requestData.page_number = 1;
    this.fetchCustomerList();
  }

  onVipFilterChange(): void {
    this.requestData.page_number = 1;
    this.fetchCustomerList();
  }

  onEdit(customer: ICustomer): void {
    if (!customer.id) return;
    (document.activeElement as HTMLElement)?.blur();
    this._router.navigate(['/cms/customers/update-customer', customer.id]);
  }

  onAddCustomer(): void {
    (document.activeElement as HTMLElement)?.blur();
    this._router.navigate(['/cms/customers/add-customer']);
  }

  onDelete(customer: ICustomer): void {
    (document.activeElement as HTMLElement)?.blur();
    this._confirmService.confirmDelete('This will hide the customer but keep their order history.')
      .then((result) => {
        if (result.isConfirmed) {
          this.executeDelete(customer);
        }
      });
  }

  private executeDelete(customer: ICustomer): void {
    this.isPageLoad = true;
    const deletePayload = {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email || null,
      address: customer.address || null,
      dietary_notes: customer.dietary_notes || null,
      is_vip: !!customer.is_vip,
      is_active: false,
      is_deleted: true
    };

    this._customerService.upsertCustomer(deletePayload)
      .pipe(finalize(() => this.isPageLoad = false))
      .subscribe({
        next: (res) => {
          if (res?.status) {
            this._snackbar.openSnackBar(res.message || 'Customer deleted', 'success');
            this.fetchCustomerList();
          } else {
            this._snackbar.openSnackBar(res?.message || 'Failed to delete customer', 'error');
          }
        },
        error: (err) => {
          this._snackbar.openSnackBar(err.error?.message || 'Error deleting customer', 'error');
        }
      });
  }

  onRedeemPoints(customer: ICustomer): void {
    if (!customer.id) {
      return;
    }

    const dialogRef = this._dialog.open(CustomerRedeemDialogComponent, {
      width: '420px',
      data: { customer },
      panelClass: 'customer-redeem-dialog'
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.fetchCustomerList();
      }
    });
  }

  getTierLabel(tier: string): string {
    return tier || 'REGULAR';
  }

  getTierClass(tier: string): string {
    const classes: Record<string, string> = {
      PLATINUM: 'tier-platinum',
      GOLD: 'tier-gold',
      SILVER: 'tier-silver',
      REGULAR: 'tier-regular'
    };
    return classes[tier] || 'tier-regular';
  }
}

// Dialog Component for Redeeming Loyalty Points
@Component({
  selector: 'app-customer-redeem-dialog',
  standalone: false,
  templateUrl: './customer-redeem-dialog.component.html'
})
export class CustomerRedeemDialogComponent {
  isSaving = false;
  pointsToRedeem: number | null = null;

  constructor(
    public dialogRef: MatDialogRef<CustomerRedeemDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { customer: ICustomer },
    private _customerService: CmsCustomerService,
    private _snackbar: CustomSnackbarService
  ) {}

  get availablePoints(): number {
    return this.data?.customer?.loyalty_points ?? 0;
  }

  onSubmit(): void {
    const customerId = this.data?.customer?.id;
    const points = Number(this.pointsToRedeem);

    if (!customerId) {
      this._snackbar.openSnackBar('This customer cannot be identified', 'error');
      return;
    }

    if (!Number.isInteger(points) || points <= 0) {
      this._snackbar.openSnackBar('Enter a whole number of points greater than zero', 'error');
      return;
    }

    if (points > this.availablePoints) {
      this._snackbar.openSnackBar(`Only ${this.availablePoints} points are available`, 'error');
      return;
    }

    this.isSaving = true;
    this._customerService.redeemPoints(customerId, points)
      .pipe(finalize(() => this.isSaving = false))
      .subscribe({
        next: (res) => {
          if (res?.status) {
            this._snackbar.openSnackBar(res.message || 'Loyalty points redeemed', 'success');
            this.dialogRef.close(true);
          } else {
            this._snackbar.openSnackBar(res?.message || 'Failed to redeem points', 'error');
          }
        },
        error: (err) => {
          this._snackbar.openSnackBar(err.error?.message || 'Error redeeming points', 'error');
        }
      });
  }

  close(): void {
    this.dialogRef.close(false);
  }
}