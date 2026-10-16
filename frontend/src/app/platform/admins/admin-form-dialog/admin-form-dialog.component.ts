import { Component, Inject, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { finalize } from 'rxjs/operators';

import { CustomSnackbarService } from '../../../shared/custom-snackbar/custom-snackbar.service';
import { IEntityResponse } from '../../../models/ICommon.model';
import { ISuperAdmin } from '../../models/platform.model';
import { PlatformAdminService } from '../../services/platform-admin.service';

/** Longest the accounts table allows; the server enforces the same window. */
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 20;

/**
 * Create or edit a platform operator.
 *
 * One dialog for both: the fields are the same and only the password (create
 * only) and the submit call differ, so a second near-identical component would
 * be a copy to keep in step. The API call lives here rather than in the list so
 * a validation failure from the server keeps the form open with its input
 * intact; the list only reloads once the dialog closes with `true`.
 */
@Component({
  selector: 'app-admin-form-dialog',
  templateUrl: './admin-form-dialog.component.html',
  styleUrl: './admin-form-dialog.component.scss',
})
export class AdminFormDialogComponent {

  private fb = inject(FormBuilder);
  private _admins = inject(PlatformAdminService);
  private _snackbar = inject(CustomSnackbarService);

  readonly isEdit: boolean;
  form!: FormGroup;
  isSaving = false;

  constructor(
    private _dialogRef: MatDialogRef<AdminFormDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public admin: ISuperAdmin | null
  ) {
    this.isEdit = !!admin;
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      first_name: [this.admin?.first_name ?? '', [Validators.required, Validators.maxLength(50)]],
      last_name: [this.admin?.last_name ?? '', [Validators.required, Validators.maxLength(50)]],
      email: [this.admin?.email ?? '', [Validators.required, Validators.email, Validators.maxLength(255)]],
      password: ['', this.isEdit ? [] : [Validators.required, Validators.minLength(PASSWORD_MIN), Validators.maxLength(PASSWORD_MAX)]],
      confirm_password: ['', this.isEdit ? [] : [Validators.required]],
    }, this.isEdit ? {} : { validators: this.passwordsMatch });
  }

  /** Create only: the two password boxes must agree before the call is made. */
  private passwordsMatch(group: FormGroup) {
    const password = group.get('password')?.value;
    const confirm = group.get('confirm_password')?.value;
    return password && confirm && password === confirm ? null : { mismatch: true };
  }

  save(): void {
    if (this.form.invalid || this.isSaving) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    const value = this.form.value;

    const request$ = this.isEdit
      ? this._admins.update(this.admin!.id, {
          first_name: value.first_name,
          last_name: value.last_name,
          email: value.email,
        })
      : this._admins.create({
          first_name: value.first_name,
          last_name: value.last_name,
          email: value.email,
          password: value.password,
        });

    request$
      .pipe(finalize(() => (this.isSaving = false)))
      .subscribe({
        next: (resp: IEntityResponse) => {
          this._snackbar.openSnackBar(resp?.message || 'Saved.', 'success');
          this._dialogRef.close(true);
        },
        error: (err) => {
          this._snackbar.openSnackBar(err?.error?.message || 'Could not save.', 'error');
        },
      });
  }

  cancel(): void {
    this._dialogRef.close(false);
  }
}
