import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

/**
 * Gate for the console's authenticated shell.
 *
 * A missing token is not worth an error screen: the user is sent to the
 * platform sign-in with a `UrlTree`, so the router cancels the original
 * navigation instead of briefly rendering a shell that cannot load data.
 *
 * The key is the platform's own (`cms_sa_accessToken`), kept hardcoded and
 * distinct from the tenant token so neither can stand in for the other.
 */
export const platformAuthGuard: CanActivateFn = () => {
  const router = inject(Router);

  if (sessionStorage.getItem('cms_sa_accessToken')) {
    return true;
  }

  return router.createUrlTree(['/platform/login']);
};
