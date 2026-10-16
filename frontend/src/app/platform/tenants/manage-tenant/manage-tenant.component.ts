import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { CustomSnackbarService } from '../../../shared/custom-snackbar/custom-snackbar.service';
import { IEntityResponse } from '../../../models/ICommon.model';
import { ITenant } from '../../models/platform.model';
import { PlatformConfigService } from '../../services/platform-config.service';
import { PlatformTenantService } from '../../services/platform-tenant.service';

/** Mirrors the backend's SLUG_REGEX exactly -- see tenant_management_schema.py. */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

/**
 * One screen for both halves of a create -- the workspace and its first
 * administrator -- and for the (necessarily narrower) edit, where the admin
 * fields are absent because the backend does not accept them there.
 *
 * Client-side rules restate the server's rather than replace them: the same
 * regex, the same 6..20 password window. The server remains the authority; a
 * mismatch only decides whether the browser warns first or the API does.
 */
@Component({
  selector: 'app-manage-tenant',
  templateUrl: './manage-tenant.component.html',
  styleUrl: './manage-tenant.component.scss',
})
export class ManageTenantComponent {

  private fb = inject(FormBuilder);
  private _route = inject(ActivatedRoute);
  private _router = inject(Router);
  private _tenants = inject(PlatformTenantService);
  private _config = inject(PlatformConfigService);
  private _snackbar = inject(CustomSnackbarService);

  form!: FormGroup;
  tenantId: number | null = null;
  isLoading = false;
  isSaving = false;

  /** Common IANA zones, offered as suggestions -- free text is still allowed. */
  readonly timezoneSuggestions = [
    'Asia/Kolkata',
    'Asia/Dubai',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Europe/London',
    'Europe/Paris',
    'America/New_York',
    'America/Los_Angeles',
    'Australia/Sydney',
    'UTC',
  ];

  readonly currencySuggestions = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD'];

  get isEdit(): boolean {
    return this.tenantId !== null;
  }

  /**
   * The host this workspace will be served from, recomputed as the slug is
   * typed. The subdomain is the tenant's real identity, so showing its
   * consequence next to the field is the difference between "a slug" and
   * "a URL people will use".
   *
   * The domain comes from the deployment rather than from a literal here: the
   * form's job is to show what the operator's own install will do with the
   * slug, and only the server knows that.
   */
  get tenantHost(): string {
    const slug = String(this.form?.get('slug')?.value ?? '').trim().toLowerCase();
    return this._config.tenantHost(slug);
  }

  /** The same domain, shown as the field's suffix. */
  get hostSuffix(): string {
    return this._config.tenantHostSuffix;
  }

  ngOnInit(): void {
    const idParam = this._route.snapshot.paramMap.get('id');
    this.tenantId = idParam ? Number(idParam) : null;

    this.buildForm();

    if (this.tenantId !== null) {
      this.loadTenant(this.tenantId);
    }
  }

  private buildForm(): void {
    const controls: Record<string, unknown> = {
      name: ['', [Validators.required, Validators.maxLength(120)]],
      slug: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(50),
          Validators.pattern(SLUG_PATTERN),
        ],
      ],
      timezone: ['', [Validators.required, Validators.maxLength(50)]],
      currency: ['', [Validators.required, Validators.pattern(/^[A-Za-z]{3}$/)]],
    };

    if (!this.isEdit) {
      controls['admin_first_name'] = ['', [Validators.required, Validators.maxLength(50)]];
      controls['admin_last_name'] = ['', [Validators.required, Validators.maxLength(50)]];
      controls['admin_email'] = [
        '',
        [Validators.required, Validators.email, Validators.maxLength(255)],
      ];
      controls['admin_password'] = [
        '',
        [Validators.required, Validators.minLength(6), Validators.maxLength(20)],
      ];
    }

    this.form = this.fb.group(controls);
  }

  private loadTenant(id: number): void {
    this.isLoading = true;
    this._tenants.get(id)
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: (resp: IEntityResponse) => {
          const tenant = resp?.data as ITenant | null;
          if (!tenant) {
            return;
          }
          this.form.patchValue({
            name: tenant.name,
            slug: tenant.slug,
            timezone: tenant.timezone,
            currency: tenant.currency,
          });
        },
        error: (err) => {
          this._snackbar.openSnackBar(
            err?.error?.message || 'Could not load the tenant.',
            'error'
          );
          this.goBack();
        },
      });
  }

  save(): void {
    if (this.form.invalid || this.isSaving) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.value;
    this.isSaving = true;

    const request$: Observable<IEntityResponse> = this.isEdit
      ? this._tenants.update(this.tenantId as number, {
          name: value.name,
          slug: value.slug,
          timezone: value.timezone,
          currency: value.currency,
        })
      : this._tenants.create({
          name: value.name,
          slug: value.slug,
          timezone: value.timezone,
          currency: value.currency,
          admin_first_name: value.admin_first_name,
          admin_last_name: value.admin_last_name,
          admin_email: value.admin_email,
          admin_password: value.admin_password,
        });

    request$
      .pipe(finalize(() => (this.isSaving = false)))
      .subscribe({
        next: (resp) => {
          this._snackbar.openSnackBar(resp?.message || 'Saved.', 'success');
          this.goBack();
        },
        error: (err) => {
          this._snackbar.openSnackBar(
            err?.error?.message || 'Could not save the tenant.',
            'error'
          );
        },
      });
  }

  goBack(): void {
    this._router.navigate(['/platform/tenants']);
  }
}
