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
 * Inclusive upper bound for “low stock”: same as {@link ProductListItemCell} when passed this value.
 * Low stock means **some** sellable units remain and available count is at most this number:
 * `0 < getAvailableStock(product) <= LOW_STOCK_THRESHOLD` (e.g. 1–5 when threshold is 5).
 * Out of stock (`available === 0`) is excluded.
 */
export const LOW_STOCK_THRESHOLD = 5;

/** True when the product is not out of stock but available units are ≤ {@link LOW_STOCK_THRESHOLD}. */
export function isLowStockProduct(product: Pick<Product, 'quantity' | 'reserved'>): boolean {
  const available = getAvailableStock(product);
  return available > 0 && available <= LOW_STOCK_THRESHOLD;
}

/** Inclusive minimum sellable units for “high stock” (product search quick filter, non-inventory). */
export const HIGH_STOCK_THRESHOLD = 30;

/** True when available sellable units are at least {@link HIGH_STOCK_THRESHOLD}. */
export function isHighStockProduct(product: Pick<Product, 'quantity' | 'reserved'>): boolean {
  return getAvailableStock(product) >= HIGH_STOCK_THRESHOLD;
}

/**
 * Stock-only filter for inventory; composed with uniform group (All / Top / …) and search.
 * Uses **available** quantity (total − reserved). Greater/less are strict; between is inclusive.
 */
export type InventoryStockFilter =
  | { kind: 'unavailable' }
  | { kind: 'gt'; a: number }
  | { kind: 'lt'; a: number }
  | { kind: 'between'; a: number; b: number };

/** Whether a product matches the inventory stock filter (null = no stock filter). */
export function productMatchesInventoryStockFilter(
  product: Pick<Product, 'quantity' | 'reserved'>,
  filter: InventoryStockFilter | null,
): boolean {
  if (filter == null) return true;
  const avail = getAvailableStock(product);
  if (filter.kind === 'unavailable') return avail === 0;
  if (filter.kind === 'gt') return avail > filter.a;
  if (filter.kind === 'lt') return avail < filter.a;
  const lo = Math.min(filter.a, filter.b);
  const hi = Math.max(filter.a, filter.b);
  return avail >= lo && avail <= hi;
}

export interface ProductListResponse {
  products: Product[];
  total?: number;
  has_more: boolean;
}
