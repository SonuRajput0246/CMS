import { Component, inject } from '@angular/core';
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

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
    });
  }

  togglePasswordHide(): void {
    this.hidePassword = !this.hidePassword;
  }

  LoginUser(): void {
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
