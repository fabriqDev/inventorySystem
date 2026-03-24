import { CartTransactionType } from '@/core/types';
import type { CompanyWithRole } from '@/core/types/company';
import type { OrderStatusEnum, OrderWithItems, OrdersResponse, PaymentProviderEnum, PaymentTypeEnum } from '@/core/types/order';
import type { OrderItem } from '@/core/types/order';
import type { Product, ProductListResponse } from '@/core/types/product';
import type { InventoryTransfer } from '@/core/types/transfer';
import type {
  FetchRequestedOrderLinesOptions,
  FetchRequestedOrdersOptions,
  RequestedOrderLinesResponse,
  RequestedOrdersResponse,
} from '@/core/types/requested-orders';

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
  /**
   * Web: `localStorage` was updated from another tab (or extension). Re-load cache and refresh.
   * No-op on native; still safe to call.
   */
  syncSessionFromBrowserStorage(): Promise<AppSession | null>;
}

export interface FetchProductsOptions {
  search?: string;
  page?: number;
  limit?: number;
}

export interface FetchOrdersOptions {
  status?: OrderStatusEnum | 'all';
  page?: number;
  limit?: number;
  /** ISO date string for start of date range filter (inclusive). */
  dateFrom?: string;
  /** ISO date string for end of date range filter (inclusive, end of day). */
  dateTo?: string;
}

/** Required date bounds for PDF export (orders with line items). */
export interface FetchOrdersWithItemsExportOptions {
  dateFrom: string;
  dateTo: string;
}


/** Student details for a requested item. */
export interface RequestDetails {
  name: string;
  class: string;
  phone?: string;
}

export interface CreateOrderItemInput {
  /** article_code of the product. */
  article_code: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  transaction_type: CartTransactionType;
  tax_percentage?: number;
  tax_amount?: number;
  total: number;
  /** Present only for request items; drives order_item_requests nested insert. */
  request_details?: RequestDetails;
}

/** Optional checkout buyer block; stored server-side as JSON (e.g. `buyer_details` jsonb). */
export interface OrderCheckoutBuyerDetails {
  student_name?: string;
  student_class?: string;
  parent_name?: string;
  parent_phone?: string;
}

export interface CreateOrderInput {
  company_id: string;
  user_id: string;
  subtotal: number;
  tax_amount: number;
  /** Total calculated on client (can be negative); sent to server. */
  total: number;
  payment_type: PaymentTypeEnum;
  payment_provider?: PaymentProviderEnum;
  cash_share: number;
  online_share: number;
  /** Order status: 'success' for immediate payments, 'pending' for PG flows awaiting confirmation. */
  status?: OrderStatusEnum;
  order_items: CreateOrderItemInput[];
  /** Saved on `order_history.notes` when the column exists. */
  notes?: string;
  /** Saved as JSON on the order row when the column exists (e.g. `buyer_details`). */
  buyer_details?: OrderCheckoutBuyerDetails | null;
}

export interface CreateOrderResult {
  /** Server-generated order id. Use for receipt, print and display after order is successful. */
  server_order_id: string;
  total: number;
}

export interface CreateRazorpayOrderInput {
  server_order_id: string;
  amount: number;
  currency: string;
}

export interface CreateRazorpayOrderResult {
  razorpay_order_id: string;
}

export interface VerifyRazorpayPaymentInput {
  server_order_id: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface VerifyRazorpayPaymentResult {
  success: boolean;
  status: OrderStatusEnum;
}

export interface UpdateOrderStatusInput {
  server_order_id: string;
  status: OrderStatusEnum;
}

export interface CreateTransferItemInput {
  /** article_code of the product. */
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
  fetchOrders(companyId: string, opts: FetchOrdersOptions): Promise<OrdersResponse>;
  fetchOrderItems(orderId: string): Promise<OrderItem[]>;
  fetchOrdersWithItemsForExport(
    companyId: string,
    opts: FetchOrdersWithItemsExportOptions,
  ): Promise<OrderWithItems[]>;
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult | null>;
  createRazorpayOrder(input: CreateRazorpayOrderInput): Promise<CreateRazorpayOrderResult>;
  verifyRazorpayPayment(input: VerifyRazorpayPaymentInput): Promise<VerifyRazorpayPaymentResult>;
  updateOrderStatus(input: UpdateOrderStatusInput): Promise<void>;
  fetchPendingTransfers(companyId: string): Promise<InventoryTransfer[]>;
  fetchTransferHistory(companyId: string): Promise<InventoryTransfer[]>;
  createTransfer(input: CreateTransferInput): Promise<CreateTransferResult | null>;
  acceptTransfer(transferId: string): Promise<InventoryTransfer | null>;
  rejectTransfer(transferId: string): Promise<InventoryTransfer | null>;
  cancelTransfer(transferId: string): Promise<InventoryTransfer | null>;
  fetchRequestedOrders(
    companyId: string,
    opts: FetchRequestedOrdersOptions,
  ): Promise<RequestedOrdersResponse>;
  fetchRequestedOrderLines(
    orderId: string,
    opts: FetchRequestedOrderLinesOptions,
  ): Promise<RequestedOrderLinesResponse>;
  fulfillSelectedItems(orderId: string, requestIds: string[]): Promise<{ success: boolean; affected_rows: number }>;
}

export interface BackendProvider {
  auth: AuthProvider;
  data: DataProvider;
}
