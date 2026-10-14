import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { CommonService } from '../services/common.service';


@Injectable({
  providedIn: 'root'
})
export class AuthGuard {
    constructor(private router: Router) {}

    canActivate(route: ActivatedRouteSnapshot): boolean {

        const token = sessionStorage.getItem('cms_accessToken');

        if (!token) {
            sessionStorage.clear();
            this.router.navigate(['/auth/login'], { replaceUrl: true });
            return false;
        }

        const menuId = route.data?.['menuId'];
        if (!menuId) {
            return true;
        }

        const userData = localStorage.getItem('cms_userData');
        if (!userData) {
            this.router.navigate(['/auth/login'], { replaceUrl: true });
            return false;
        }

        const userProfile = JSON.parse(userData);
        const hasAccess = userProfile?.menu_access?.some(
            (x: any) => x.module_id === menuId
        );

        if (!hasAccess) {
            this.router.navigate(['/unauthorized-access'], { replaceUrl: true });
            return false;
        }

        return true;
    }
}