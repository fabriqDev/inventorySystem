export interface Product {
  id: string;
  company_id: string;
  name: string;
  sku: string;
  /** Barcode or QR code string used for scanning and search */
  scan_code: string | null;
  price: number;
  currency: string;
  quantity?: number;
  image_url?: string | null;
  created_at?: string;
  /** Set when loaded via barcode scan (product_sizes); needed for create sale */
  size_id?: string;
  size?: string;
}

export interface ProductListResponse {
  products: Product[];
  total?: number;
  has_more: boolean;
}
