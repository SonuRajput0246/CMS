import { Component, ElementRef, ViewChild, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';

import { CustomSnackbarService } from '../../shared/custom-snackbar/custom-snackbar.service';
import { IEntityResponse } from '../../models/ICommon.model';
import { PlatformAuthService } from '../services/platform-auth.service';

/**
 * Platform sign-in. Deliberately not the tenant login with a different logo:
 * it talks to `/api/super-admin/auth/login`, writes the `cms_sa_*` keys and
 * lands on `/platform/dashboard`. The tenant screen does none of those, and
 * the two must never be reachable from each other's host.
 */
@Component({
  selector: 'app-platform-login',
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class PlatformLoginComponent {

  private fb = inject(FormBuilder);
  private _auth = inject(PlatformAuthService);
  private _router = inject(Router);
  private _snackbar = inject(CustomSnackbarService);

  loginForm!: FormGroup;
  hidePassword = true;
  isLoading = false;

  @ViewChild('emailInput') private _emailInput?: ElementRef<HTMLInputElement>;
  @ViewChild('passwordInput') private _passwordInput?: ElementRef<HTMLInputElement>;

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
    });
  }

  togglePasswordHide(): void {
    this.hidePassword = !this.hidePassword;
  }

  /**
   * Browser autofill writes straight into the inputs and never dispatches
   * `input`, so Angular's reactive controls never hear about it and keep their
   * initial empty value. Validating the model alone would therefore reject a
   * perfectly good saved-credential login as blank -- and, worse, report
   * "Email is required" under a field the user can plainly see is filled.
   *
   * So the DOM is treated as the source of truth at submit time. For anything
   * the user actually typed this is a no-op: `formControlName` keeps the input
   * and the control in step.
   */
  private syncFromDom(): void {
    this.loginForm.patchValue({
      email: this._emailInput?.nativeElement.value ?? '',
      password: this._passwordInput?.nativeElement.value ?? '',
    });
  }

  LoginUser(): void {
    // Read the inputs back before trusting the model. See syncFromDom().
    this.syncFromDom();

    if (this.loginForm.invalid || this.isLoading) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this._auth.login(this.loginForm.value)
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: (resp: IEntityResponse) => {
          if (resp?.status && resp.data) {
            this._auth.saveSession(resp.data);
            this._snackbar.openSnackBar(resp.message || 'Login successful.', 'success');
            this._router.navigate(['/platform/dashboard']);
          } else {
            this._snackbar.openSnackBar(resp?.message || 'Login failed.', 'error');
          }
        },
        error: (err) => {
          this._snackbar.openSnackBar(
            err?.error?.message || 'Unable to sign in. Please try again.',
            'error'
          );
        },
      });
  }
}
