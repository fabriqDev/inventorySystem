import type { Product } from './product';

export interface CartItem {
  product_id: string;
  product: Pick<Product, 'id' | 'name' | 'price' | 'barcode' | 'currency'>;
  quantity: number;
  unit_price: number;
  currency: string;
}
