import type { TileId } from './tiles';

export type Role = 'super_admin' | 'sub_admin' | 'company_admin' | 'employee';

export interface Company {
  id: string;
  name: string;
  slug?: string;
  /** Razorpay key/ID for online PG; when set, "Online (via PG)" is shown at checkout */
  razorpay_id?: string | null;
  /** Top-level address from backend (company_name, company_code, address) */
  address?: string;
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
