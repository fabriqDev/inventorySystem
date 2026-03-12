import type { Product } from './product';

export type CartTransactionType = 'sale' | 'refund';

export interface CartItem {
  /** article_code of the product. */
  article_code: string;
  product: Pick<Product, 'article_code' | 'name' | 'price' | 'scan_code' | 'currency' | 'size'>;
  quantity: number;
  unit_price: number;
  currency: string;
  transactionType: CartTransactionType;
}
