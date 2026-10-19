import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { OtpVerificationComponent } from './otp-verification/otp-verification.component';
import { ForgotPasswordComponent } from './forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './reset-password/reset-password.component';
import { SignUpComponent } from './sign-up/sign-up.component';
import { AcceptInvitationComponent } from './accept-invitation/accept-invitation.component';

const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },
  {
    path: 'otp-verification',
    component: OtpVerificationComponent
  },
  {
    path: 'forgot-password',
    component: ForgotPasswordComponent
  },
  {
    path: 'reset-password',
    component: ResetPasswordComponent
  },
  {
    path: 'sign-up',
    component: SignUpComponent
  },
  /* Reached only by clicking the emailed link -- no auth guard, by design:
   * the single-use token in the query string IS the credential, and this
   * page is what turns it into an account. Path must match
   * `tenant_urls.tenant_accept_url()` on the server. */
  {
    path: 'accept-invitation',
    component: AcceptInvitationComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AuthRoutingModule { }
