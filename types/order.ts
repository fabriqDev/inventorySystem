import { CartTransactionType } from './cart';

export type OrderStatus = 'success' | 'failed' | 'pending';
export type PaymentMethod = 'cash' | 'online' | 'rz_pg';

export interface Order {
  /** Use only locally when creating a new order temporarily (e.g. optimistic UI). Do not send to server. */
  client_order_id?: string;
  /** Server-generated id. Prefer this for display, receipt and print once order status is successful. */
  server_order_id?: string;
  company_id: string;
  user_id?: string;
  /** Reference to original order when this is a refund. */
  original_order_id?: string | null;
  subtotal: number;
  total: number;
  currency: string;
  payment_method: PaymentMethod;
  status: OrderStatus;
  created_at: string;
}

export interface OrderItem {
  /** article_code of the product. */
  article_code: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  /** sale = deduct stock, refund = add stock; only at item level */
  transaction_type?: CartTransactionType;
  tax_percentage?: number;
  tax_amount?: number;
  total: number;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
}
