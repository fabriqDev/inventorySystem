import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { CartItem } from '@/core/types/cart';
import {
  LOCAL_ORDER_DRAFTS_MAX,
  type LocalOrderDraft,
  type LocalOrderDraftRequestMeta,
  localOrderDraftsStorageKey,
  newLocalDraftId,
} from '@/core/types/local-order-draft';

function sortDraftsDesc(a: LocalOrderDraft, b: LocalOrderDraft): number {
  return b.updatedAt - a.updatedAt;
}

function parseStoredDrafts(raw: string | null): LocalOrderDraft[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidDraft).sort(sortDraftsDesc);
  } catch {
    return [];
  }
}

function isValidDraft(x: unknown): x is LocalOrderDraft {
  if (x == null || typeof x !== 'object') return false;
  const d = x as Record<string, unknown>;
  return (
    typeof d.id === 'string' &&
    typeof d.companyId === 'string' &&
    typeof d.updatedAt === 'number' &&
    Array.isArray(d.items) &&
    d.requestMeta != null &&
    typeof d.requestMeta === 'object'
  );
}

type LocalOrderDraftsContextValue = {
  drafts: LocalOrderDraft[];
  hydrated: boolean;
  /** Returns false if shelf is full (max 5). */
  saveDraft: (input: {
    companyId: string;
    items: CartItem[];
    requestMeta: LocalOrderDraftRequestMeta;
  }) => Promise<boolean>;
  deleteDraft: (id: string) => Promise<void>;
  /** Remove from shelf and return snapshot for loading into cart; null if not found. */
  takeDraft: (id: string) => Promise<LocalOrderDraft | null>;
};

const LocalOrderDraftsContext = createContext<LocalOrderDraftsContextValue | undefined>(undefined);

export function LocalOrderDraftsProvider({
  companyId,
  children,
}: {
  companyId: string;
  children: React.ReactNode;
}) {
  const [drafts, setDrafts] = useState<LocalOrderDraft[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const persist = useCallback(
    async (next: LocalOrderDraft[]) => {
      const sorted = [...next].sort(sortDraftsDesc);
      setDrafts(sorted);
      if (!companyId) return;
      const key = localOrderDraftsStorageKey(companyId);
      try {
        await AsyncStorage.setItem(key, JSON.stringify(sorted));
      } catch {
        /* ignore */
      }
    },
    [companyId],
  );

  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    if (!companyId) {
      setDrafts([]);
      setHydrated(true);
      return () => {
        cancelled = true;
      };
    }
    const key = localOrderDraftsStorageKey(companyId);
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (cancelled) return;
        setDrafts(parseStoredDrafts(raw));
      } catch {
        if (!cancelled) setDrafts([]);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const saveDraft = useCallback(
    async (input: {
      companyId: string;
      items: CartItem[];
      requestMeta: LocalOrderDraftRequestMeta;
    }): Promise<boolean> => {
      if (!input.companyId || input.items.length === 0) return false;
      let added = false;
      setDrafts((prev) => {
        if (prev.length >= LOCAL_ORDER_DRAFTS_MAX) return prev;
        added = true;
        const next: LocalOrderDraft = {
          id: newLocalDraftId(),
          companyId: input.companyId,
          updatedAt: Date.now(),
          items: input.items.map((i) => ({
            ...i,
            product: { ...i.product },
          })),
          requestMeta: { ...input.requestMeta },
        };
        const merged = [...prev, next].sort(sortDraftsDesc);
        void AsyncStorage.setItem(
          localOrderDraftsStorageKey(input.companyId),
          JSON.stringify(merged),
        ).catch(() => {});
        return merged;
      });
      return added;
    },
    [],
  );

  const deleteDraft = useCallback(
    async (id: string) => {
      if (!companyId) return;
      setDrafts((prev) => {
        const next = prev.filter((d) => d.id !== id);
        void AsyncStorage.setItem(localOrderDraftsStorageKey(companyId), JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [companyId],
  );

  const takeDraft = useCallback(
    async (id: string): Promise<LocalOrderDraft | null> => {
      if (!companyId) return null;
      let taken: LocalOrderDraft | null = null;
      setDrafts((prev) => {
        const idx = prev.findIndex((d) => d.id === id);
        if (idx < 0) return prev;
        taken = prev[idx]!;
        const next = prev.filter((d) => d.id !== id);
        void AsyncStorage.setItem(localOrderDraftsStorageKey(companyId), JSON.stringify(next)).catch(() => {});
        return next;
      });
      return taken;
    },
    [companyId],
  );

  const value = useMemo(
    () => ({
      drafts,
      hydrated,
      saveDraft,
      deleteDraft,
      takeDraft,
    }),
    [drafts, hydrated, saveDraft, deleteDraft, takeDraft],
  );

  return <LocalOrderDraftsContext.Provider value={value}>{children}</LocalOrderDraftsContext.Provider>;
}

export function useLocalOrderDrafts() {
  const ctx = useContext(LocalOrderDraftsContext);
  if (!ctx) {
    throw new Error('useLocalOrderDrafts must be used within LocalOrderDraftsProvider');
  }
  return ctx;
}
