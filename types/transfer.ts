export type TransferStatus = 'pending' | 'accepted' | 'rejected';

export interface TransferItem {
  article_code: string;
  quantity: number;
  /** Optional for display when API returns them */
  product_name?: string;
}

export interface InventoryTransfer {
  id: string;
  source_company_id: string;
  source_company_name?: string;
  destination_company_id: string;
  destination_company_name?: string;
  status: TransferStatus;
  created_by_user_id?: string;
  created_by_user?: { display_name?: string };
  responded_by_user_id?: string;
  notes?: string;
  items: TransferItem[];
  created_at: string;
  updated_at?: string;
}
