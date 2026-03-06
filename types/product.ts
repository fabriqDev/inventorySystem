/** Shared product catalog (products table) */
export interface ProductMaster {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  uniform_type: string;
  year: number | null;
}

/** Company-specific inventory row (product_inventory table) - API response shape */
export interface ProductInventoryRow {
  article_code: string;
  size?: string | null;
  stock: number;
  selling_price: number;
  discount_percentage: number;
  tax_percentage: number;
  reserved: number;
  product: ProductMaster;
}

/**
 * Flat product for list/cart (id = article_code where applicable).
 * Used by GetProducts/GetProductByBarcode mapping and UI.
 */
export interface Product {
  id: string;
  company_id?: string;
  name: string;
  /** Barcode / article_code string used for scanning and search */
  scan_code: string;
  price: number;
  currency: string;
  quantity?: number;
  size?: string;
  discount_percentage?: number;
  tax_percentage?: number;
  reserved?: number;
  image_url?: string | null;
  created_at?: string;
  product?: ProductMaster;
}

export interface ProductListResponse {
  products: Product[];
  total?: number;
  has_more: boolean;
}
