import { roundMoney } from '@/core/services/format';

import type { CartItem } from './cart';

export const LOCAL_ORDER_DRAFTS_MAX = 5;

export const LOCAL_ORDER_DRAFTS_STORAGE_PREFIX = 'local_order_drafts_v1:';

export type LocalOrderDraftRequestMeta = {
  childName: string;
  childClass: string;
  parentPhone: string;
};

export interface LocalOrderDraft {
  id: string;
  companyId: string;
  updatedAt: number;
  items: CartItem[];
  requestMeta: LocalOrderDraftRequestMeta;
}

export function newLocalDraftId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function draftItemLineCount(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity, 0);
}

/** Signed total (refunds negative), same rule as cart context. */
export function draftTotal(items: CartItem[]): number {
  return roundMoney(
    items.reduce(
      (sum, i) => sum + i.unit_price * i.quantity * (i.transactionType === 'refund' ? -1 : 1),
      0,
    ),
  );
}

export function localOrderDraftsStorageKey(companyId: string): string {
  return `${LOCAL_ORDER_DRAFTS_STORAGE_PREFIX}${companyId}`;
}
