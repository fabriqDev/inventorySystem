/**
 * Flat product for list/cart.
 * - article_code: unique identifier from product_inventory, used for display/search/barcode and sent to server.
 */
export interface Product {
  /** article_code – unique product identifier for display, search, barcode, and server operations. */
  article_code: string;
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
}

/** Available stock = total stock minus reserved. Use this everywhere instead of inline math. */
export function getAvailableStock(product: Pick<Product, 'quantity' | 'reserved'>): number {
  return Math.max(0, (product.quantity ?? 0) - (product.reserved ?? 0));
}

export interface ProductListResponse {
  products: Product[];
  total?: number;
  has_more: boolean;
}
