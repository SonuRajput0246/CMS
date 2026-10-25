import { Injectable } from '@angular/core';
import {
    HttpInterceptor,
    HttpEvent,
    HttpHandler,
    HttpRequest,
    HttpErrorResponse,
    HttpClient
} from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, filter, switchMap, take } from 'rxjs/operators';
import { Router } from '@angular/router';
// import { CommonService } from '../services/common.service';
import { AppConfig } from '../core/config/config';
import { TenantService } from '../services/tenant.service';


@Injectable()
export class HttpIntercept implements HttpInterceptor {

    private isRefreshing = false;
    private refreshTokenSubject: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);

    constructor(
        private router: Router,
        private http: HttpClient,
        // private _common: CommonService,
        private config: AppConfig,
        private tenant: TenantService,
    ) {}


    intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {

        //// The console and the tenant app share this browser, so the two
        //// sessions are told apart by URL: a call to /api/super-admin carries
        //// the platform token and no tenant header, everything else carries
        //// the tenant token and slug.
        const isSuperAdminApi = req.url.includes('/api/super-admin/');

        const accessToken = isSuperAdminApi
            ? sessionStorage.getItem('cms_sa_accessToken')
            : sessionStorage.getItem('cms_accessToken');

        //// Do NOT attach token for login or public APIs
        const isPublicApi =
            req.url.includes('/auth/login') ||
            req.url.includes('/auth/get-fresh-token') ||
            req.url.includes('/assets/');

        //// A platform caller has no workspace, so it must not send a slug --
        //// doing so would make the backend read it as a tenant request.
        let authReq = isSuperAdminApi ? req : this.addTenantHeader(req);

        if (accessToken && !isPublicApi) {
            authReq = this.addToken(authReq, accessToken);
        }

        return next.handle(authReq).pipe(
            catchError((error: HttpErrorResponse) => {

                const isAuthOrValidationApi =
                    authReq.url.includes('/auth/verify-email') ||
                    authReq.url.includes('/auth/login') ||
                    authReq.url.includes('/auth/get-fresh-token') ||
                    authReq.url.includes('/auth/reset-password') ||
                    authReq.url.includes('/user-account/update-password') ||
                    authReq.url.includes('/auth/activate-account');
                if (error.status === 401 && !isPublicApi && !isAuthOrValidationApi) {
                    //// The tenant refresh mints a tenant token, which the
                    //// platform API rejects; a platform 401 is terminal.
                    if (isSuperAdminApi) {
                        return this.handlePlatform401();
                    }
                    return this.handle401Error(authReq, next);
                }
                
                // if (error.status === 403) {
                //     this._snackbarService.openSnackBar('Access denied', 'error');
                // }

                return throwError(() => error);
            })
        );
    }

    private addTenantHeader(req: HttpRequest<any>): HttpRequest<any> {
        if (!this.tenant.slug) {
            return req;
        }
        return req.clone({
            setHeaders: {
                'X-Tenant-Slug': this.tenant.slug
            }
        });
    }

    private addToken(req: HttpRequest<any>, token: string): HttpRequest<any> {
        return req.clone({
            setHeaders: {
                Authorization: `Bearer ${token}`
            }
        });
    }

    private handle401Error(
        request: HttpRequest<any>,
        next: HttpHandler
    ): Observable<HttpEvent<any>> {
        if (!this.isRefreshing) {
            this.isRefreshing = true;
            this.refreshTokenSubject.next(null);
            return this.http.post<any>(
                `${this.config.get('BASE_URL')}/api/v1/auth/get-fresh-token`,
                {},
                { withCredentials: true }
            ).pipe(
                //// 1. Handle errors for the REFRESH call specifically
                catchError(() => {
                    this.isRefreshing = false;
                    return this.logout(); //// Refresh failed, log out
                }),
                switchMap((res) => {
                    this.isRefreshing = false;
                    if (res?.status && res?.data?.access_token) {
                        sessionStorage.setItem('cms_accessToken', res.data.access_token);
                        localStorage.setItem('cms_userData', JSON.stringify(res.data));
                        this.refreshTokenSubject.next(res.data.access_token);
                        return next.handle(this.addTenantHeader(this.addToken(request, res.data.access_token)));
                    }
                    return this.logout();
                }),
                // catchError(() => {
                //     this.isRefreshing = false;
                //     return this.logout();
                // })
            );
        }

        //// If refresh already in progress, wait
        return this.refreshTokenSubject.pipe(
            filter(token => token !== null),
            take(1),
            switchMap(token =>
                next.handle(this.addTenantHeader(this.addToken(request, token!)))
            )
        );
    }

    private logout(): Observable<never> {
        sessionStorage.clear();
        localStorage.clear();
        this.router.navigate(['/auth/login']);
        return throwError(() => new Error('Session expired'));
    }

    /**
     * A platform token cannot be refreshed: `/auth/get-fresh-token` is the
     * tenant endpoint and signs a tenant token, which `/api/super-admin`
     * refuses. So a 401 clears the platform session and returns to the
     * console's sign-in, leaving any tenant session untouched.
     */
    private handlePlatform401(): Observable<never> {
        sessionStorage.removeItem('cms_sa_accessToken');
        localStorage.removeItem('cms_sa_profile');
        this.router.navigate(['/login'], { replaceUrl: true });
        return throwError(() => new Error('Platform session expired'));
    }
}
