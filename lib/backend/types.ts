import type { CompanyWithRole } from '@/types/company';
import type { Product, ProductListResponse } from '@/types/product';
import type { Order, OrderStatus, OrderWithItems } from '@/types/order';
import type { InventoryTransfer } from '@/types/transfer';

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

/** product_id = article_code; no size_id. transaction_type: sale = deduct stock, return = add stock */
export type OrderItemTransactionType = 'sale' | 'return';

export interface CreateOrderItemInput {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  transaction_type: OrderItemTransactionType;
  tax_percentage?: number;
  tax_amount?: number;
  total: number;
}

export interface CreateOrderInput {
  company_id: string;
  user_id: string;
  subtotal: number;
  tax_amount: number;
  /** Total calculated on client (can be negative); sent to server. */
  total: number;
  payment_method: string;
  order_items: CreateOrderItemInput[];
}

export interface CreateOrderResult {
  order_id: string;
  total: number;
}

export interface CreateTransferItemInput {
  article_code: string;
  quantity: number;
}

export interface CreateTransferInput {
  source_company_id: string;
  destination_company_id: string;
  created_by: string;
  items: CreateTransferItemInput[];
  notes?: string;
}

export interface CreateTransferResult {
  id: string;
  status: string;
}


export interface DataProvider {
  fetchCompanies(userId: string): Promise<CompanyWithRole[]>;
  fetchProducts(companyId: string, opts: FetchProductsOptions): Promise<ProductListResponse>;
  fetchProductByBarcode(companyId: string, barcode: string): Promise<Product | null>;
  fetchOrders(companyId: string, opts: FetchOrdersOptions): Promise<OrderWithItems[]>;
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult | null>;
  fetchPendingTransfers(companyId: string): Promise<InventoryTransfer[]>;
  fetchTransferHistory(companyId: string): Promise<InventoryTransfer[]>;
  createTransfer(input: CreateTransferInput): Promise<CreateTransferResult | null>;
  acceptTransfer(transferId: string): Promise<InventoryTransfer | null>;
  rejectTransfer(transferId: string): Promise<InventoryTransfer | null>;
}

export interface BackendProvider {
  auth: AuthProvider;
  data: DataProvider;
}
