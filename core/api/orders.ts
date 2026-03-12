import { backend } from '@/core/backend';
import type { CreateOrderInput, CreateOrderResult } from '@/core/backend/types';
import { createMockOrder, getMockOrders } from '@/core/services/mock-data';
import type { OrderStatus, OrderWithItems } from '@/core/types/order';

interface FetchOrdersOptions {
  status?: OrderStatus | 'all';
}

export async function fetchOrders(
  companyId: string,
  options: FetchOrdersOptions,
  useMock: boolean,
): Promise<OrderWithItems[]> {
  if (useMock) return mockFetchOrders(companyId, options);
  return backend.data.fetchOrders(companyId, options);
}

export async function createOrder(
  input: CreateOrderInput,
  useMock: boolean,
): Promise<CreateOrderResult | null> {
  if (useMock) return createMockOrder(input);
  return backend.data.createOrder(input);
}

async function mockFetchOrders(
  companyId: string,
  { status }: FetchOrdersOptions,
): Promise<OrderWithItems[]> {
  let orders = await getMockOrders(companyId);

  if (status && status !== 'all') {
    orders = orders.filter((o) => o.status === status);
  }

  return orders.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}
