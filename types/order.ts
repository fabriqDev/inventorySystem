export type OrderStatus = 'success' | 'failed' | 'pending';
export type PaymentMethod = 'cash' | 'online';

export interface Order {
  id: string;
  company_id: string;
  total_amount: number;
  currency: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  razorpay_order_id?: string | null;
  razorpay_payment_id?: string | null;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  currency: string;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
}
