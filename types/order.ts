export type OrderStatus = 'success' | 'failed' | 'pending';
export type PaymentMethod = 'cash' | 'online';
export type TransactionType = 'sale' | 'refund';

export interface Order {
  order_id: string;
  company_id: string;
  user_id?: string;
  transaction_type: TransactionType;
  original_order_id?: string | null;
  subtotal: number;
  total: number;
  currency: string;
  payment_method: PaymentMethod;
  status: OrderStatus;
  created_at: string;
}

export interface OrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  tax_percentage?: number;
  tax_amount?: number;
  total: number;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
}
