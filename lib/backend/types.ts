import type { CompanyWithRole } from '@/types/company';
import type { Product, ProductListResponse } from '@/types/product';
import type { Order, OrderStatus } from '@/types/order';

export interface AppSession {
  accessToken: string;
  user: {
    id: string;
    email?: string;
    displayName?: string;
    phoneNumber?: string;
  };
}

export interface AuthProvider {
  signIn(email: string, password: string): Promise<{ error: Error | null }>;
  signOut(): Promise<void>;
  getSession(): Promise<AppSession | null>;
  onAuthStateChange(cb: (session: AppSession | null) => void): () => void;
  getUser(): Promise<{ id: string; email?: string; displayName?: string; phoneNumber?: string } | null>;
}

export interface FetchProductsOptions {
  search?: string;
  page?: number;
  limit?: number;
}

export interface FetchOrdersOptions {
  status?: OrderStatus | 'all';
}

export interface CreateSaleItemInput {
  product_id: string;
  size_id: string;
  product_name: string;
  size: string;
  quantity: number;
  unit_price: number;
  tax_percentage?: number;
  tax_amount?: number;
  total: number;
}

export interface CreateSaleInput {
  company_id: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  payment_method: string;
  sale_items: CreateSaleItemInput[];
}

export interface CreateSaleResult {
  id: string;
  sale_number: string;
  total: number;
}

export interface DataProvider {
  fetchCompanies(userId: string): Promise<CompanyWithRole[]>;
  fetchProducts(companyId: string, opts: FetchProductsOptions): Promise<ProductListResponse>;
  fetchProductByBarcode(companyId: string, barcode: string): Promise<Product | null>;
  fetchOrders(companyId: string, opts: FetchOrdersOptions): Promise<Order[]>;
  createSale(input: CreateSaleInput): Promise<CreateSaleResult | null>;
}

export interface BackendProvider {
  auth: AuthProvider;
  data: DataProvider;
}
