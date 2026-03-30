import {
  isHighStockProduct,
  isLowStockProduct,
  getAvailableStock,
  type Product,
  type UniformGroupValue,
} from '@/core/types/product';

export const QUICK_FILTER_LOW_STOCK = 'low_stock' as const;
export const QUICK_FILTER_HIGH_STOCK = 'high_stock' as const;
export const QUICK_FILTER_UNAVAILABLE = 'unavailable' as const;

export type ProductQuickFilter =
  | 'all'
  | UniformGroupValue
  | typeof QUICK_FILTER_LOW_STOCK
  | typeof QUICK_FILTER_HIGH_STOCK
  | typeof QUICK_FILTER_UNAVAILABLE;

/** Apply category + stock quick filters (default product search list). */
export function applyProductQuickFilter(
  products: Product[],
  quickFilter: ProductQuickFilter,
): Product[] {
  if (quickFilter === 'all') return products;
  if (quickFilter === QUICK_FILTER_UNAVAILABLE) {
    return products.filter((p) => getAvailableStock(p) === 0);
  }
  if (quickFilter === QUICK_FILTER_LOW_STOCK) {
    return products.filter((p) => isLowStockProduct(p));
  }
  if (quickFilter === QUICK_FILTER_HIGH_STOCK) {
    return products.filter((p) => isHighStockProduct(p));
  }
  return products.filter((p) => p.uniform_group === quickFilter);
}
