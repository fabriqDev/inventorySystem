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

/**
 * Upper bound (exclusive) for “low stock”: same as {@link ProductListItemCell} when passed this value.
 * Low stock means **some** sellable units remain but fewer than this number:
 * `0 < getAvailableStock(product) < LOW_STOCK_THRESHOLD` (e.g. 1–9 when threshold is 10).
 * Out of stock (`available === 0`) is excluded.
 */
export const LOW_STOCK_THRESHOLD = 10;

/** True when the product is not out of stock but below {@link LOW_STOCK_THRESHOLD} available units. */
export function isLowStockProduct(product: Pick<Product, 'quantity' | 'reserved'>): boolean {
  const available = getAvailableStock(product);
  return available > 0 && available < LOW_STOCK_THRESHOLD;
}

export interface ProductListResponse {
  products: Product[];
  total?: number;
  has_more: boolean;
}
