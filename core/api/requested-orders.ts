import { backend } from '@/core/backend';
import type {
  FetchRequestedOrderLinesOptions,
  FetchRequestedOrdersOptions,
  FulfillmentTab,
  RequestedOrderLine,
  RequestedOrderLinesResponse,
  RequestedOrderListRow,
  RequestedOrderPdfPage,
  RequestedOrdersPdfVariant,
  RequestedOrdersResponse,
  RequestItemSearchPayload,
} from '@/core/types/requested-orders';

export type { FetchRequestedOrderLinesOptions, FetchRequestedOrdersOptions };

const PDF_FETCH_LIMIT = 100;
const PDF_PAGE_GUARD = 500;
const LIST_AGG_LIMIT = 100;

export async function fetchRequestedOrders(
  companyId: string,
  options: FetchRequestedOrdersOptions,
  useMock: boolean,
): Promise<RequestedOrdersResponse> {
  if (useMock) return { orders: [], totalCount: 0 };
  return backend.data.fetchRequestedOrders(companyId, options);
}

/**
 * Loads every order row for a tab + student/phone filters (no order-id filter).
 * Used to apply partial order-id “contains” client-side (Hasura cannot `ilike` uuid).
 */
export async function fetchAllRequestedOrdersForTab(
  companyId: string,
  tab: FulfillmentTab,
  searchFilters: RequestItemSearchPayload,
  useMock: boolean,
): Promise<RequestedOrderListRow[]> {
  if (useMock) return [];
  const all: RequestedOrderListRow[] = [];
  for (let page = 1, guard = 0; guard < PDF_PAGE_GUARD; guard += 1, page += 1) {
    const res = await fetchRequestedOrders(
      companyId,
      { page, limit: LIST_AGG_LIMIT, tab, searchFilters },
      useMock,
    );
    all.push(...res.orders);
    if (res.orders.length === 0 || all.length >= res.totalCount) break;
  }
  return all;
}

export async function fetchRequestedOrderLines(
  orderId: string,
  options: FetchRequestedOrderLinesOptions,
  useMock: boolean,
): Promise<RequestedOrderLinesResponse> {
  if (useMock) return { lines: [], totalCount: 0 };
  return backend.data.fetchRequestedOrderLines(orderId, options);
}

export async function fulfillSelectedItems(
  orderId: string,
  requestIds: string[],
  useMock: boolean,
): Promise<{ success: boolean; affected_rows: number }> {
  if (useMock) return { success: true, affected_rows: 0 };
  return backend.data.fulfillSelectedItems(orderId, requestIds);
}

export async function revertFulfillmentToPending(
  requestId: string,
  useMock: boolean,
): Promise<{ success: boolean; affected_rows: number }> {
  if (useMock) return { success: true, affected_rows: 1 };
  return backend.data.revertFulfillmentToPending(requestId);
}

async function fetchAllRequestedOrderLines(orderId: string, useMock: boolean): Promise<RequestedOrderLine[]> {
  const all: RequestedOrderLine[] = [];
  for (let page = 1, guard = 0; guard < PDF_PAGE_GUARD; guard += 1, page += 1) {
    const res = await fetchRequestedOrderLines(orderId, { page, limit: PDF_FETCH_LIMIT }, useMock);
    all.push(...res.lines);
    if (res.lines.length === 0 || all.length >= res.totalCount) break;
  }
  return all;
}

/**
 * All orders for the given tab, each PDF page listing only pending or fulfilled request lines.
 */
export async function fetchRequestedOrdersPdfPages(
  companyId: string,
  variant: RequestedOrdersPdfVariant,
  useMock: boolean,
): Promise<RequestedOrderPdfPage[]> {
  if (useMock) return [];
  const tab = variant === 'unfulfilled' ? 'unfulfilled' : 'fulfilled';
  const wantStatus = variant === 'unfulfilled' ? 'pending' : 'fulfilled';

  const orderRows: { order_id: string; created_at: string; total: number }[] = [];
  for (let page = 1, guard = 0; guard < PDF_PAGE_GUARD; guard += 1, page += 1) {
    const res = await fetchRequestedOrders(
      companyId,
      { page, limit: PDF_FETCH_LIMIT, tab },
      useMock,
    );
    orderRows.push(...res.orders);
    if (res.orders.length === 0 || orderRows.length >= res.totalCount) break;
  }

  const pages: RequestedOrderPdfPage[] = [];
  for (const row of orderRows) {
    const allLines = await fetchAllRequestedOrderLines(row.order_id, useMock);
    const exportLines = allLines.filter((l) => l.fulfillment_status === wantStatus);
    if (exportLines.length === 0) continue;
    pages.push({
      order_id: row.order_id,
      created_at: row.created_at,
      total: row.total,
      lines: exportLines,
    });
  }
  return pages;
}
