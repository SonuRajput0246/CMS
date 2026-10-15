/**
 * Wire shapes for the platform (super admin) API.
 *
 * These mirror `backend/src/api/services/tenant_management_service.py` and
 * `super_admin_auth_service.py` exactly, including the derived `status` word
 * the backend computes from the two flags -- the UI renders one label rather
 * than re-deriving active/inactive/archived from `is_active` + `is_deleted`.
 */

export type TenantStatus = 'active' | 'inactive' | 'archived';

export interface IPlatformProfile {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  is_active: boolean;
  last_password_update_at?: string | null;
}

export interface IPlatformLoginData {
  access_token: string;
  profile: IPlatformProfile;
}

export interface ITenantSummary {
  total_tenants: number;
  active_tenants: number;
  inactive_tenants: number;
  archived_tenants: number;
  total_users: number;
}

export interface ITenant {
  id: number;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  is_active: boolean;
  is_deleted: boolean;
  status: TenantStatus;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  user_count?: number | null;
}

/** Create payload: the tenant and its first administrator in one form. */
export interface ICreateTenant {
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  admin_first_name: string;
  admin_last_name: string;
  admin_email: string;
  admin_password: string;
}

/** Partial edit payload -- the service only touches fields that are present. */
export interface IUpdateTenant {
  name?: string;
  slug?: string;
  timezone?: string;
  currency?: string;
}
