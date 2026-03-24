import { backend } from '@/core/backend';
import type {
  CreateOrderInput,
  CreateOrderResult,
  CreateRazorpayOrderInput,
  CreateRazorpayOrderResult,
  FetchOrdersOptions,
  FetchOrdersWithItemsExportOptions,
  UpdateOrderStatusInput,
  VerifyRazorpayPaymentInput,
  VerifyRazorpayPaymentResult,
} from '@/core/backend/types';
import { createMockOrder, getMockOrders } from '@/core/services/mock-data';
import type { OrderItem, OrdersResponse, OrderWithItems } from '@/core/types/order';

export type { FetchOrdersOptions, FetchOrdersWithItemsExportOptions };

export async function fetchOrders(
  companyId: string,
  options: FetchOrdersOptions,
  useMock: boolean,
): Promise<OrdersResponse> {
  if (useMock) return mockFetchOrders(companyId, options);
  return backend.data.fetchOrders(companyId, options);
}

export async function fetchOrderItems(
  orderId: string,
  useMock: boolean,
): Promise<OrderItem[]> {
  if (useMock) return [];
  return backend.data.fetchOrderItems(orderId);
}

export async function fetchOrdersWithItemsForExport(
  companyId: string,
  opts: FetchOrdersWithItemsExportOptions,
  useMock: boolean,
): Promise<OrderWithItems[]> {
  if (useMock) {
    const all = await getMockOrders(companyId);
    const fromT = new Date(opts.dateFrom).getTime();
    const toT = new Date(opts.dateTo).getTime();
    return all.filter((o) => {
      const t = new Date(o.created_at).getTime();
      return t >= fromT && t <= toT;
    });
  }
  return backend.data.fetchOrdersWithItemsForExport(companyId, opts);
}

export async function createOrder(
  input: CreateOrderInput,
  useMock: boolean,
): Promise<CreateOrderResult | null> {
  if (useMock) return createMockOrder(input);
  return backend.data.createOrder(input);
}

export async function createRazorpayOrder(
  input: CreateRazorpayOrderInput,
): Promise<CreateRazorpayOrderResult> {
  return backend.data.createRazorpayOrder(input);
}

export async function verifyRazorpayPayment(
  input: VerifyRazorpayPaymentInput,
): Promise<VerifyRazorpayPaymentResult> {
  return backend.data.verifyRazorpayPayment(input);
}

export async function updateOrderStatus(
  input: UpdateOrderStatusInput,
): Promise<void> {
  return backend.data.updateOrderStatus(input);
}

async function mockFetchOrders(
  companyId: string,
  { status }: FetchOrdersOptions,
): Promise<OrdersResponse> {
  let orders = await getMockOrders(companyId);

  if (status && status !== 'all') {
    orders = orders.filter((o) => o.status === status);
  }

  const sorted = orders.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const totalRevenue = sorted.reduce((s, o) => s + (o.total ?? 0), 0);
  const cashTotal = sorted.reduce((s, o) => s + (o.cash_share ?? 0), 0);
  const onlineTotal = sorted.reduce((s, o) => s + (o.online_share ?? 0), 0);

  return {
    orders: sorted,
    totalCount: sorted.length,
    stats: {
      totalRevenue,
      totalRefunds: 0,
      cashTotal,
      onlineTotal,
    },
  };
}
