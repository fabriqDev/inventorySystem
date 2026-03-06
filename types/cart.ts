import type { Product } from './product';

export type CartLineType = 'sale' | 'return';

export interface CartItem {
  product_id: string;
  product: Pick<Product, 'id' | 'name' | 'price' | 'scan_code' | 'currency'>;
  quantity: number;
  unit_price: number;
  currency: string;
  lineType: CartLineType;
}
