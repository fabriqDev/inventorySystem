import { backend } from '@/core/backend';
import type {
  FetchRequestedOrderLinesOptions,
  FetchRequestedOrdersOptions,
  RequestedOrderLinesResponse,
  RequestedOrdersResponse,
} from '@/core/types/requested-orders';

export type { FetchRequestedOrderLinesOptions, FetchRequestedOrdersOptions };

export async function fetchRequestedOrders(
  companyId: string,
  options: FetchRequestedOrdersOptions,
  useMock: boolean,
): Promise<RequestedOrdersResponse> {
  if (useMock) return { orders: [], totalCount: 0 };
  return backend.data.fetchRequestedOrders(companyId, options);
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
