import { backend } from '@/lib/backend';
import { MOCK_ORDERS } from '@/lib/mock-data';
import type { Order, OrderStatus } from '@/types/order';

interface FetchOrdersOptions {
  status?: OrderStatus | 'all';
}

export async function fetchOrders(
  companyId: string,
  options: FetchOrdersOptions,
  useMock: boolean,
): Promise<Order[]> {
  if (useMock) return mockFetchOrders(companyId, options);
  return backend.data.fetchOrders(companyId, options);
}

function mockFetchOrders(
  companyId: string,
  { status }: FetchOrdersOptions,
): Order[] {
  let orders = MOCK_ORDERS[companyId] ?? [];

  if (status && status !== 'all') {
    orders = orders.filter((o) => o.status === status);
  }

  return orders.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}
