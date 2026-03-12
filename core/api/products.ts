import { backend } from '@/core/backend';
import { getMockProducts } from '@/core/services/mock-data';
import type { Product, ProductListResponse } from '@/core/types/product';

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
    const products = await getMockProducts(companyId);
    const trimmed = barcode.trim();
    return products.find((p) => p.scan_code.trim() === trimmed) ?? null;
  }
  return backend.data.fetchProductByBarcode(companyId, barcode);
}

async function mockFetchProducts(
  companyId: string,
  { search, page = 1, limit = PRODUCTS_PAGE_SIZE }: FetchProductsOptions,
): Promise<ProductListResponse> {
  let products = await getMockProducts(companyId);

  if (search) {
    const q = search.toLowerCase();
    products = products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.scan_code.toLowerCase().includes(q),
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
