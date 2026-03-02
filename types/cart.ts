import type { Product } from './product';

export interface CartItem {
  product_id: string;
  product: Pick<Product, 'id' | 'name' | 'price' | 'scan_code' | 'currency'>;
  quantity: number;
  unit_price: number;
  currency: string;
  /** When true, line contributes negatively to total (return). */
  isReturn?: boolean;
}
