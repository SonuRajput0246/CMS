/**
 * Shape of `assets/config.json`, the one static file the app reads before it
 * can reach the backend.
 *
 * The base URL is validated in InitialService.loadStaticConfig() and rejected
 * when absent -- without it there is nothing to call. Everything else is
 * optional and simply absent unless a deployment sets it.
 */
export interface IAppSetting {
  global_setting?: GlobalSetting;
}

export interface GlobalSetting {
  app_logo_image?: string;
  api_base_url?: string;
  terms_condition_url?: string;
  privacy_policy_url?: string;
  page_load_time?: number;
}
