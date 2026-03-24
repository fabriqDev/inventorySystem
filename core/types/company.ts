import type { TileId } from './tiles';

export type Role = 'super_admin' | 'sub_admin' | 'company_admin' | 'employee';

/** Per-company feature flags coming from the backend `config` jsonb column. */
export interface CompanyConfig {
  /** When false, barcode/QR scanning is hidden for this company. Default true if omitted. */
  show_barcode?: boolean;
  /** When false, hide Requested Items tile and request flows. Default true if omitted. */
  show_requested?: boolean;
  /** When true, checkout shows buyer details (student class required before payment). Default false if omitted. */
  ask_order_buyer_details?: boolean;
}

export interface Company {
  id: string;
  name: string;
  slug?: string;
  /** Razorpay key/ID for online PG; when set, "Online (via PG)" is shown at checkout */
  razorpay_id?: string | null;
  /** Top-level address from backend (company_name, company_code, address) */
  address?: string;
  /** Feature flags / config from the backend config jsonb column. */
  config?: CompanyConfig;
  meta?: {
    address?: string;
    logo_url?: string;
  };
  created_at: string;
  updated_at: string;
}

export interface CompanyWithRole extends Company {
  role: Role;
  visible_tiles: TileId[];
}
