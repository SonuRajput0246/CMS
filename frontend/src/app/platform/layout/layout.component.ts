import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';

import { CustomSnackbarService } from '../../shared/custom-snackbar/custom-snackbar.service';
import { PlatformAuthService } from '../services/platform-auth.service';

/**
 * Authenticated console shell: one toolbar, a router outlet, and a sign-out
 * that revokes the token server-side. A local-only clear would leave a copied
 * token usable until it expired, so the call is attempted first and the local
 * copy is dropped either way -- failing to reach the server must not trap the
 * user in a session they asked to leave.
 */
@Component({
  selector: 'app-platform-layout',
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
})
export class PlatformLayoutComponent {

  private _auth = inject(PlatformAuthService);
  private _router = inject(Router);
  private _snackbar = inject(CustomSnackbarService);

  isLoggingOut = false;

  get userName(): string {
    return this._auth.fullName || 'Platform Admin';
  }

  get userEmail(): string {
    return this._auth.profile?.email ?? '';
  }

  logout(): void {
    if (this.isLoggingOut) {
      return;
    }

    this.isLoggingOut = true;
    this._auth.logout()
      .pipe(finalize(() => (this.isLoggingOut = false)))
      .subscribe({
        next: () => this.finishLogout(),
        error: () => this.finishLogout(),
      });
  }

  private finishLogout(): void {
    this._auth.clearSession();
    this._snackbar.openSnackBar('Logged out successfully.', 'success');
    this._router.navigate(['/platform/login'], { replaceUrl: true });
  }
}
