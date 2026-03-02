import type { TileId } from './tiles';

export type Role = 'super_admin' | 'admin' | 'employee';

export interface Company {
  id: string;
  name: string;
  slug?: string;
  /** Razorpay key for this company; optional. */
  rzpay_key_id?: string;
  meta: {
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
