import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { CartItem } from '@/types/cart';
import type { Product } from '@/types/product';
import { CURRENCY_DEFAULT } from '@/constants/currency';

type CartContextType = {
  items: CartItem[];
  addItem: (product: Product, options?: { isReturn?: boolean }) => void;
  removeItem: (productId: string, isReturn?: boolean) => void;
  updateQuantity: (productId: string, quantity: number, isReturn?: boolean) => void;
  clearCart: () => void;
  total: number;
  currency: string;
  itemCount: number;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((product: Product, options?: { isReturn?: boolean }) => {
    const isReturn = options?.isReturn ?? false;
    setItems((prev) => {
      const existing = prev.find(
        (i) => i.product_id === product.id && (i.isReturn ?? false) === isReturn,
      );
      if (existing) {
        return prev.map((i) =>
          i.product_id === product.id && (i.isReturn ?? false) === isReturn
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
          isReturn,
        },
      ];
    });
  }, []);

  const removeItem = useCallback((productId: string, isReturn?: boolean) => {
    const flag = isReturn ?? false;
    setItems((prev) =>
      prev.filter((i) => !(i.product_id === productId && (i.isReturn ?? false) === flag)),
    );
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number, isReturn?: boolean) => {
    const flag = isReturn ?? false;
    if (quantity <= 0) {
      setItems((prev) =>
        prev.filter((i) => !(i.product_id === productId && (i.isReturn ?? false) === flag)),
      );
      return;
    }
    setItems((prev) =>
      prev.map((i) =>
        i.product_id === productId && (i.isReturn ?? false) === flag ? { ...i, quantity } : i,
      ),
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const total = useMemo(
    () =>
      items.reduce(
        (sum, i) => sum + i.unit_price * i.quantity * ((i.isReturn ?? false) ? -1 : 1),
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
