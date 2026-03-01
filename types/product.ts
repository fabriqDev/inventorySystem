export interface Product {
  id: string;
  company_id: string;
  name: string;
  sku: string;
  barcode: string | null;
  price: number;
  currency: string;
  quantity?: number;
  image_url?: string | null;
  created_at?: string;
}

export interface ProductListResponse {
  products: Product[];
  total?: number;
  has_more: boolean;
}
