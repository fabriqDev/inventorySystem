import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { Product } from '@/types/product';
import { useDataSource } from '@/contexts/data-source-context';
import { fetchProducts } from '@/lib/api/products';

const MAX_PRODUCTS_PER_COMPANY = 300;

type ProductCacheContextType = {
  prefetchProducts: (companyId: string) => Promise<void>;
  refreshProducts: (companyId: string) => Promise<void>;
  getCachedProducts: (companyId: string) => Product[];
  findByBarcode: (companyId: string, barcode: string) => Product | null;
  filterProducts: (companyId: string, query: string) => Product[];
  isLoading: (companyId: string) => boolean;
  isCached: (companyId: string) => boolean;
};

const ProductCacheContext = createContext<ProductCacheContextType | undefined>(undefined);

export function ProductCacheProvider({ children }: { children: React.ReactNode }) {
  const { useMockData } = useDataSource();
  const [cache, setCache] = useState<Record<string, Product[]>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const prefetchingRef = useRef<Set<string>>(new Set());

  const prefetchProducts = useCallback(
    async (companyId: string) => {
      if (prefetchingRef.current.has(companyId)) return;
      if (cache[companyId]?.length) return;

      prefetchingRef.current.add(companyId);
      setLoading((prev) => ({ ...prev, [companyId]: true }));

      try {
        const res = await fetchProducts(
          companyId,
          { limit: MAX_PRODUCTS_PER_COMPANY, page: 1 },
          useMockData,
        );
        setCache((prev) => ({ ...prev, [companyId]: res.products }));
      } finally {
        prefetchingRef.current.delete(companyId);
        setLoading((prev) => ({ ...prev, [companyId]: false }));
      }
    },
    [useMockData, cache],
  );

  const refreshProducts = useCallback(
    async (companyId: string) => {
      prefetchingRef.current.delete(companyId);
      setCache((prev) => {
        const next = { ...prev };
        delete next[companyId];
        return next;
      });
      setLoading((prev) => ({ ...prev, [companyId]: true }));

      try {
        const res = await fetchProducts(
          companyId,
          { limit: MAX_PRODUCTS_PER_COMPANY, page: 1 },
          useMockData,
        );
        setCache((prev) => ({ ...prev, [companyId]: res.products }));
      } finally {
        setLoading((prev) => ({ ...prev, [companyId]: false }));
      }
    },
    [useMockData],
  );

  const getCachedProducts = useCallback(
    (companyId: string): Product[] => cache[companyId] ?? [],
    [cache],
  );

  const findByBarcode = useCallback(
    (companyId: string, barcode: string): Product | null => {
      const list = cache[companyId] ?? [];
      const normalized = barcode.trim().toLowerCase();
      if (!normalized) return null;
      return (
        list.find(
          (p) => p.scan_code.trim().toLowerCase() === normalized,
        ) ?? null
      );
    },
    [cache],
  );

  const filterProducts = useCallback(
    (companyId: string, query: string): Product[] => {
      const list = cache[companyId] ?? [];
      if (!query.trim()) return list;
      const q = query.toLowerCase().trim();
      return list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.scan_code.toLowerCase().includes(q),
      );
    },
    [cache],
  );

  const isLoading = useCallback((companyId: string) => loading[companyId] === true, [loading]);
  const isCached = useCallback(
    (companyId: string) => (cache[companyId]?.length ?? 0) > 0,
    [cache],
  );

  const value: ProductCacheContextType = {
    prefetchProducts,
    refreshProducts,
    getCachedProducts,
    findByBarcode,
    filterProducts,
    isLoading,
    isCached,
  };

  return (
    <ProductCacheContext.Provider value={value}>{children}</ProductCacheContext.Provider>
  );
}

export function useProductCache() {
  const context = useContext(ProductCacheContext);
  if (!context) {
    throw new Error('useProductCache must be used within a ProductCacheProvider');
  }
  return context;
}
