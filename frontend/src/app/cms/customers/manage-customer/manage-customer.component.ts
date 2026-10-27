import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';

import { INavigationaBar } from '../../../models/ICommon.model';
import { ICustomer } from '../../../models/ICms.model';
import { CmsCustomerService } from '../../../services/cms/customer.service';
import { CustomSnackbarService } from '../../../shared/custom-snackbar/custom-snackbar.service';

/**
 * Add / edit a customer on its own route.
 *
 * Customer code, loyalty points, visit counts and spend are absent on purpose:
 * they are server-owned and only move when an order is closed or points are
 * redeemed. See UpsertCustomerSchema on the backend.
 */
@Component({
  selector: 'app-manage-customer',
  templateUrl: './manage-customer.component.html',
  styleUrls: ['../../tables/table-form-page.scss']
})
export class ManageCustomerComponent implements OnInit {

  private _customerService = inject(CmsCustomerService);
  private _snackbar = inject(CustomSnackbarService);
  private _router = inject(Router);
  private _route = inject(ActivatedRoute);
  private _fb = inject(FormBuilder);

  private readonly listRoute = '/cms/customers';

  navData: INavigationaBar[] = [];
  customerForm!: FormGroup;

  editingCustomer: ICustomer | null = null;
  isEditMode = false;
  isPageLoad = false;
  isSaving = false;

  ngOnInit(): void {
    this.initNavigation();
    this.createForm();

    const customerId = Number(this._route.snapshot.paramMap.get('id'));
    if (customerId) {
      this.loadCustomer(customerId);
    }
  }

  private initNavigation(): void {
    this.navData = [
      { displayValue: 'Home', isClickable: true, isDashboard: false, redirectValue: '/cms/dashboard' },
      { displayValue: 'CMS', isClickable: false, isDashboard: false },
      { displayValue: 'Customer Management', isClickable: true, isDashboard: false, redirectValue: this.listRoute },
      {
        displayValue: this._route.snapshot.data['breadcrumb'] || 'Add Customer',
        isClickable: false,
        isDashboard: false
      }
    ];
  }

  private createForm(): void {
    this.customerForm = this._fb.group({
      name: ['', [
        Validators.required,
        Validators.maxLength(50),
        Validators.pattern(/^[A-Za-z '-]+$/)
      ]],
      phone: ['', [
        Validators.required,
        Validators.minLength(10),
        Validators.maxLength(20),
        Validators.pattern(/^\+?1?\d{9,15}$/)
      ]],
      email: ['', [Validators.email, Validators.maxLength(255)]],
      address: ['', Validators.maxLength(255)],
      dietary_notes: ['', Validators.maxLength(500)],
      is_vip: [false],
      is_active: [true]
    });
  }

  private loadCustomer(customerId: number): void {
    this.isPageLoad = true;
    this._customerService.getCustomerById(customerId)
      .pipe(finalize(() => this.isPageLoad = false))
      .subscribe({
        next: (res) => {
          if (!res?.status || !res.data) {
            this._snackbar.openSnackBar(res?.message || 'Failed to load the customer', 'error');
            return;
          }

          this.isEditMode = true;
          const customer = res.data as ICustomer;
          this.editingCustomer = customer;
          this.customerForm.patchValue({
            name: customer.name || '',
            phone: customer.phone || '',
            email: customer.email || '',
            address: customer.address || '',
            dietary_notes: customer.dietary_notes || '',
            is_vip: !!customer.is_vip,
            is_active: customer.is_active ?? true
          });
        },
        error: (err) => {
          const msg = err?.status === 404
            ? 'This customer no longer exists.'
            : (err?.error?.message || 'An error occurred while loading the customer');
          this._snackbar.openSnackBar(msg, 'error');
        }
      });
  }

  saveCustomer(): void {
    /// Trim before validating: the pattern validators reject leading or
    /// trailing spaces, which are invisible to the person typing.
    this.trimRequiredFields();

    if (this.customerForm.invalid) {
      this.customerForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    const value = this.customerForm.value;

    /// Optional text goes to the API as null, never "": its string sanitiser
    /// rejects blank values for fields it does not list as optional.
    const payload = {
      id: this.editingCustomer?.id || 0,
      name: String(value.name ?? '').trim(),
      phone: String(value.phone ?? '').trim(),
      email: this.nullIfBlank(value.email),
      address: this.nullIfBlank(value.address),
      dietary_notes: this.nullIfBlank(value.dietary_notes),
      is_vip: !!value.is_vip,
      is_active: !!value.is_active,
      is_deleted: false
    };

    this._customerService.upsertCustomer(payload)
      .pipe(finalize(() => this.isSaving = false))
      .subscribe({
        next: (res) => {
          if (res?.status) {
            this._snackbar.openSnackBar(res.message || 'Customer saved successfully', 'success');
            this._router.navigate([this.listRoute]);
          } else {
            this._snackbar.openSnackBar(res?.message || 'Failed to save the customer', 'error');
          }
        },
        error: (err) => this._snackbar.openSnackBar(
          err?.error?.message || 'An error occurred while saving the customer', 'error'
        )
      });
  }

  goBack(): void {
    this._router.navigate([this.listRoute]);
  }

  private trimRequiredFields(): void {
    for (const field of ['name', 'phone']) {
      const control = this.customerForm.get(field);
      const trimmed = String(control?.value ?? '').trim();
      if (control && trimmed !== control.value) {
        control.setValue(trimmed);
      }
    }
  }

  private nullIfBlank(value: string | null | undefined): string | null {
    const trimmed = String(value ?? '').trim();
    return trimmed ? trimmed : null;
  }
}
