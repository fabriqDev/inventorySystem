import { backend } from '@/lib/backend';
import { MOCK_PRODUCTS } from '@/lib/mock-data';
import type { Product, ProductListResponse } from '@/types/product';

export const PRODUCTS_PAGE_SIZE = 40;

interface FetchProductsOptions {
  search?: string;
  page?: number;
  limit?: number;
}

export async function fetchProducts(
  companyId: string,
  options: FetchProductsOptions,
  useMock: boolean,
): Promise<ProductListResponse> {
  if (useMock) return mockFetchProducts(companyId, options);
  return backend.data.fetchProducts(companyId, options);
}

export async function fetchProductByBarcode(
  companyId: string,
  barcode: string,
  useMock: boolean,
): Promise<Product | null> {
  if (useMock) {
    const products = MOCK_PRODUCTS[companyId] ?? [];
    return products.find((p) => p.barcode === barcode) ?? null;
  }
  return backend.data.fetchProductByBarcode(companyId, barcode);
}

function mockFetchProducts(
  companyId: string,
  { search, page = 1, limit = PRODUCTS_PAGE_SIZE }: FetchProductsOptions,
): ProductListResponse {
  let products = MOCK_PRODUCTS[companyId] ?? [];

  if (search) {
    const q = search.toLowerCase();
    products = products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode?.includes(q),
    );
  }

  const start = (page - 1) * limit;
  const paged = products.slice(start, start + limit);

  return {
    products: paged,
    total: products.length,
    has_more: start + limit < products.length,
  };
}
