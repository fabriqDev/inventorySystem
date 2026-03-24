import type { TileId } from './tiles';

export type Role = 'super_admin' | 'sub_admin' | 'company_admin' | 'employee';

/** Per-company feature flags coming from the backend `config` jsonb column. */
export interface CompanyConfig {
  /** When false, barcode/QR scanning is hidden for this company. Defaults to true. */
  show_barcode?: boolean;
  /** When true, the receipt is printed automatically after a successful order. Defaults to false. */
  print_receipt_automatically?: boolean;

  show_requested?: boolean;

  allow_order_buyer_details?: boolean;
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
