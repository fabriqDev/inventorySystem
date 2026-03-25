/**
 * Server `uniform_group` values (Hasura); normalized to lowercase slugs in the app.
 */
export const UniformGroup = {
  TOP: 'top',
  BOTTOM: 'bottom',
  ACCESSORY: 'accessory',
  OVERALLS: 'overalls',
  GENERIC: 'generic',
} as const;

export type UniformGroupValue = (typeof UniformGroup)[keyof typeof UniformGroup];

/** Tab order for product list filters (matches server taxonomy). */
export const UNIFORM_GROUP_TAB_ORDER: readonly UniformGroupValue[] = [
  UniformGroup.TOP,
  UniformGroup.BOTTOM,
  UniformGroup.ACCESSORY,
  UniformGroup.OVERALLS,
  UniformGroup.GENERIC,
];

export function parseUniformGroup(raw: unknown): UniformGroupValue | undefined {
  if (raw == null || raw === '') return undefined;
  const s = String(raw)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (s === 'top') return UniformGroup.TOP;
  if (s === 'bottom') return UniformGroup.BOTTOM;
  if (s === 'accessory') return UniformGroup.ACCESSORY;
  if (s === 'overalls') return UniformGroup.OVERALLS;
  if (s === 'generic') return UniformGroup.GENERIC;
  return undefined;
}

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
  /** From product.uniform_group when present and recognized. */
  uniform_group?: UniformGroupValue;
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
