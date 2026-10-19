import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';

import { CustomSnackbarService } from '../../shared/custom-snackbar/custom-snackbar.service';
import { IInvitationPreview } from '../../models/IAuth.model';
import { AuthService } from '../../services/auth.service';
import { passwordMatchValidator } from '../../validators/password-match.validator';

/**
 * The page behind the emailed invitation link: `/auth/accept-invitation?token=`.
 *
 * The token in the query string is the only credential here -- it is checked
 * with a preview first so the person sees whose invitation this is (and the
 * server can say "already accepted" or "expired") BEFORE being asked to
 * choose a password. Only a still-`pending` invitation gets the form.
 *
 * Client-side password rules (6..20) restate the server's rather than
 * replace them: the API remains the authority, a mismatch only decides
 * whether the browser warns first or the API does.
 */
@Component({
  selector: 'app-accept-invitation',
  templateUrl: './accept-invitation.component.html',
  styleUrl: './accept-invitation.component.scss',
})
export class AcceptInvitationComponent implements OnInit {

  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);
  private snackbar = inject(CustomSnackbarService);

  /**
   * `loading` -> preview in flight; `ready` -> the pending form;
   * `blocked` -> the link cannot be used (unknown, expired, superseded,
   * already accepted), so the page explains instead of asking for a password.
   */
  pageState: 'loading' | 'ready' | 'blocked' = 'loading';

  preview: IInvitationPreview | null = null;
  blockedTitle = '';
  blockedMessage = '';

  /** Accept-time failures that do not retire the link (e.g. validation). */
  acceptError = '';

  form!: FormGroup;
  isSubmitting = false;
  hidePassword = true;
  hideConfirm = true;

  private token = '';

  ngOnInit(): void {
    /* Same control names as reset-password, so passwordMatchValidator -- which
     * looks up new_password/confirmed_password -- applies unchanged. */
    this.form = this.fb.group(
      {
        new_password: [
          '',
          [Validators.required, Validators.minLength(6), Validators.maxLength(20)],
        ],
        confirmed_password: ['', Validators.required],
      },
      { validators: passwordMatchValidator }
    );

    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) {
      this.block(
        'Invalid invitation link',
        'This invitation link is not valid. Open the most recent invitation email, or ask the platform administrator for a new one.'
      );
      return;
    }
    this.previewToken();
  }

  /** Look the token up before showing anything the form depends on. */
  private previewToken(): void {
    this.auth.previewInvitation(this.token)
      .subscribe({
        next: (resp) => {
          const data = resp?.data as IInvitationPreview | null;
          if (!data) {
            this.block(
              'Invalid invitation link',
              'This invitation link is not valid. Open the most recent invitation email, or ask the platform administrator for a new one.'
            );
            return;
          }

          if (data.status === 'pending') {
            this.preview = data;
            this.pageState = 'ready';
            return;
          }

          /* A KNOWN token tells its whole story -- the person holding it was
           * genuinely invited and deserves the specific reason, not a bare
           * failure. */
          this.block(...this.blockedCopy(data.status));
        },
        error: (err) => {
          if (err?.status === 404) {
            this.block(
              'Invalid invitation link',
              'This invitation link is not valid. Open the most recent invitation email, or ask the platform administrator for a new one.'
            );
            return;
          }
          this.block(
            'Invitation unavailable',
            err?.error?.message || 'Could not check this invitation. Please try again.'
          );
        },
      });
  }

  /** The operator-facing sentence for each way a link can be unusable. */
  private blockedCopy(status: IInvitationPreview['status']): [string, string] {
    switch (status) {
      case 'accepted':
        return ['Already accepted', 'This invitation has already been accepted. Sign in to get started.'];
      case 'expired':
        return ['Invitation expired', 'This invitation link has expired. Ask the platform administrator to resend it.'];
      case 'revoked':
        return ['Invitation replaced', 'This invitation link has been replaced by a newer one. Open the most recent invitation email.'];
      default:
        return ['Invitation unavailable', 'This invitation cannot be used. Ask the platform administrator for a new one.'];
    }
  }

  private block(title: string, message: string): void {
    this.blockedTitle = title;
    this.blockedMessage = message;
    this.pageState = 'blocked';
  }

  accept(): void {
    this.acceptError = '';
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;
    this.auth.acceptInvitation({
      token: this.token,
      password: this.form.value.new_password,
    })
      .pipe(finalize(() => (this.isSubmitting = false)))
      .subscribe({
        next: (resp) => {
          this.snackbar.openSnackBar(
            resp?.message || 'Your administrator account is ready. Sign in to get started.',
            'success'
          );
          this.router.navigate(['/auth/login']);
        },
        error: (err) => {
          const message =
            err?.error?.message || 'Could not accept the invitation. Please try again.';

          /* Codes that retire the link entirely deserve the explanation
           * screen (404 unknown, 409 spent/exists, 410 replaced/expired).
           * Anything else -- 403 deactivated workspace (the link stays
           * valid), 422 password rules -- stays inline so the form is
           * still there to correct. */
          if ([404, 409, 410].includes(err?.status)) {
            const title =
              err?.status === 409 ? 'Already accepted'
                : err?.status === 410 ? 'Invitation no longer valid'
                  : 'Invalid invitation link';
            this.block(title, message);
            return;
          }
          this.acceptError = message;
        },
      });
  }
}
