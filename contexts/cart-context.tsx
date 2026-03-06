import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { CartItem, CartLineType } from '@/types/cart';
import type { Product } from '@/types/product';
import { CURRENCY_DEFAULT } from '@/constants/currency';

type CartContextType = {
  items: CartItem[];
  addItem: (product: Product, options?: { lineType?: CartLineType }) => void;
  removeItem: (productId: string, lineType?: CartLineType) => void;
  updateQuantity: (productId: string, quantity: number, lineType?: CartLineType) => void;
  clearCart: () => void;
  total: number;
  currency: string;
  itemCount: number;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

const DEFAULT_LINE_TYPE: CartLineType = 'sale';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((product: Product, options?: { lineType?: CartLineType }) => {
    const lineType = options?.lineType ?? DEFAULT_LINE_TYPE;
    setItems((prev) => {
      const existing = prev.find(
        (i) => i.product_id === product.id && i.lineType === lineType,
      );
      if (existing) {
        return prev.map((i) =>
          i.product_id === product.id && i.lineType === lineType
            ? { ...i, quantity: i.quantity + 1 }
            : i,
        );
      }
      return [
        ...prev,
        {
          product_id: product.id,
          product: {
            id: product.id,
            name: product.name,
            price: product.price,
            scan_code: product.scan_code,
            currency: product.currency,
          },
          quantity: 1,
          unit_price: product.price,
          currency: product.currency,
          lineType,
        },
      ];
    });
  }, []);

  const removeItem = useCallback((productId: string, lineType?: CartLineType) => {
    const type = lineType ?? DEFAULT_LINE_TYPE;
    setItems((prev) =>
      prev.filter((i) => !(i.product_id === productId && i.lineType === type)),
    );
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number, lineType?: CartLineType) => {
    const type = lineType ?? DEFAULT_LINE_TYPE;
    if (quantity <= 0) {
      setItems((prev) =>
        prev.filter((i) => !(i.product_id === productId && i.lineType === type)),
      );
      return;
    }
    setItems((prev) =>
      prev.map((i) =>
        i.product_id === productId && i.lineType === type ? { ...i, quantity } : i,
      ),
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const total = useMemo(
    () =>
      items.reduce(
        (sum, i) => sum + i.unit_price * i.quantity * (i.lineType === 'return' ? -1 : 1),
        0,
      ),
    [items],
  );

  const currency = items[0]?.currency || CURRENCY_DEFAULT;
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, clearCart, total, currency, itemCount }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
