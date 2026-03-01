import type { CompanyWithRole } from '@/types/company';
import type { Product, ProductListResponse } from '@/types/product';
import type { Order, OrderStatus } from '@/types/order';

export interface AppSession {
  accessToken: string;
  user: { id: string; email?: string };
}

export interface AuthProvider {
  signIn(email: string, password: string): Promise<{ error: Error | null }>;
  signOut(): Promise<void>;
  getSession(): Promise<AppSession | null>;
  onAuthStateChange(cb: (session: AppSession | null) => void): () => void;
  getUser(): Promise<{ id: string; email?: string } | null>;
}

export interface FetchProductsOptions {
  search?: string;
  page?: number;
  limit?: number;
}

export interface FetchOrdersOptions {
  status?: OrderStatus | 'all';
}

export interface DataProvider {
  fetchCompanies(userId: string): Promise<CompanyWithRole[]>;
  fetchProducts(companyId: string, opts: FetchProductsOptions): Promise<ProductListResponse>;
  fetchProductByBarcode(companyId: string, barcode: string): Promise<Product | null>;
  fetchOrders(companyId: string, opts: FetchOrdersOptions): Promise<Order[]>;
}

export interface BackendProvider {
  auth: AuthProvider;
  data: DataProvider;
}
