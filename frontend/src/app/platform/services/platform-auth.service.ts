import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { AppConfig } from '../../core/config/config';
import { IEntityResponse } from '../../models/ICommon.model';
import { IPlatformLoginData, IPlatformProfile } from '../models/platform.model';

/**
 * Platform (super admin) session, kept apart from the tenant session.
 *
 * Both can be open in the same browser, so they cannot share storage keys: a
 * tenant token under the platform's key (or the reverse) would be sent to the
 * wrong API and rejected, or -- worse -- accepted by a scope check that only
 * looked at whether a token was present. `cms_sa_*` is the platform namespace.
 *
 * Requests to `/api/super-admin` carry no `X-Tenant-Slug`: the interceptor
 * skips it for this API, because a platform caller has no workspace.
 */
@Injectable({ providedIn: 'root' })
export class PlatformAuthService {

  private http = inject(HttpClient);
  private config = inject(AppConfig);

  private readonly baseURL: string;

  constructor() {
    this.baseURL = this.config.get('BASE_URL');
  }

  login(payload: { email: string; password: string }): Observable<IEntityResponse> {
    return this.http.post<IEntityResponse>(
      `${this.baseURL}/api/super-admin/auth/login`,
      payload
    );
  }

  me(): Observable<IEntityResponse> {
    return this.http.get<IEntityResponse>(`${this.baseURL}/api/super-admin/auth/me`);
  }

  logout(): Observable<IEntityResponse> {
    return this.http.post<IEntityResponse>(
      `${this.baseURL}/api/super-admin/auth/logout`,
      {}
    );
  }

  saveSession(data: IPlatformLoginData): void {
    sessionStorage.setItem('cms_sa_accessToken', data.access_token);
    localStorage.setItem('cms_sa_profile', JSON.stringify(data.profile));
  }

  get profile(): IPlatformProfile | null {
    const raw = localStorage.getItem('cms_sa_profile');
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as IPlatformProfile;
    } catch {
      return null;
    }
  }

  get fullName(): string {
    const profile = this.profile;
    return profile ? `${profile.first_name} ${profile.last_name}`.trim() : '';
  }

  clearSession(): void {
    sessionStorage.removeItem('cms_sa_accessToken');
    localStorage.removeItem('cms_sa_profile');
  }
}
