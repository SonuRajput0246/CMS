import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AppConfig } from '../core/config/config';

@Injectable({
  providedIn: 'root'
})
export class InitialService {

  private http = inject(HttpClient);
  private appConfig = inject(AppConfig);

  /** Holds API base URL loaded at app startup */
  baseUrl!: string;

  /**
   * Load runtime config.
   *
   * `assets/config.json` supplies the API base URL. It is a static file, so it
   * is the only thing available before the backend is contacted.
   *
   * This used to be two steps: read the config, then ask the backend which
   * product it runs so the two could be compared. That comparison existed only
   * because the same codebase served two products from one build, with the
   * backend's answer deciding which endpoints exist. There is one product now,
   * so the second step had nothing left to verify and was one HTTP call on
   * every cold start.
   */
  async loadAppConfig(): Promise<void> {
    await this.loadStaticConfig();
  }

  /**
   * Read the static config.
   *
   * Rejects when api_base_url is missing, because without it there is nothing
   * to call. The bootstrap APP_INITIALIZER awaits this, so a missing base URL
   * stops the app with this message rather than letting every later request
   * fail with an opaque network error.
   */
  private loadStaticConfig(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.http.get<any>('assets/config.json').subscribe({
        next: (data) => {
          const baseUrl = data?.global_setting?.api_base_url;

          if (!baseUrl) {
            reject('api_base_url missing in config.json');
            return;
          }

          this.appConfig.set('BASE_URL', baseUrl);

          resolve();
        },
        error: reject
      });
    });
  }
}