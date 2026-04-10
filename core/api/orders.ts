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
import {
  OrderStatus,
  type OrderItem,
  type OrdersResponse,
  type OrderWithItems,
} from '@/core/types/order';

export type { FetchOrdersOptions, FetchOrdersWithItemsExportOptions };

const ORDERS_EXPORT_PAGE_SIZE = 50;

export async function fetchOrders(
  companyId: string,
  options: FetchOrdersOptions,
  useMock: boolean,
): Promise<OrdersResponse> {
  if (useMock) return mockFetchOrders(companyId, options);
  return backend.data.fetchOrders(companyId, options);
}

/**
 * Loads every order row for the given company + date range (same as {@link fetchOrders} list scope).
 * Paginates on live data; mock returns a single full page.
 */
export async function fetchAllOrdersForExport(
  companyId: string,
  opts: Omit<FetchOrdersOptions, 'page' | 'limit'>,
  useMock: boolean,
): Promise<OrderWithItems[]> {
  if (useMock) {
    const res = await fetchOrders(
      companyId,
      { ...opts, page: 1, limit: ORDERS_EXPORT_PAGE_SIZE },
      useMock,
    );
    return res.orders;
  }
  const all: OrderWithItems[] = [];
  let page = 1;
  let totalCount = 0;
  for (;;) {
    const res = await fetchOrders(
      companyId,
      { ...opts, page, limit: ORDERS_EXPORT_PAGE_SIZE },
      useMock,
    );
    if (page === 1) totalCount = res.totalCount;
    all.push(...res.orders);
    if (res.orders.length === 0 || all.length >= totalCount || res.orders.length < ORDERS_EXPORT_PAGE_SIZE) {
      break;
    }
    page += 1;
  }
  return all;
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
    if (opts.dateFrom && opts.dateTo) {
      const fromT = new Date(opts.dateFrom).getTime();
      const toT = new Date(opts.dateTo).getTime();
      return all.filter((o) => {
        const t = new Date(o.created_at).getTime();
        return t >= fromT && t <= toT;
      });
    }
    return all;
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

export async function cancelOrder(orderId: string, useMock: boolean): Promise<void> {
  if (useMock) {
    return;
  }
  return backend.data.cancelOrder(orderId);
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

  const successOrders = sorted.filter((o) => o.status === OrderStatus.SUCCESS);
  const cancelledOrders = sorted.filter((o) => o.status === OrderStatus.CANCELLED);
  const totalRevenue = successOrders.reduce((s, o) => s + (o.total ?? 0), 0);
  const cashTotal = successOrders.reduce((s, o) => s + (o.cash_share ?? 0), 0);
  const onlineTotal = successOrders.reduce((s, o) => s + (o.online_share ?? 0), 0);
  const totalRefunds = successOrders.reduce((s, o) => s + (o.refund_amount ?? 0), 0);
  const totalCancelled = cancelledOrders.reduce((s, o) => s + (o.total ?? 0), 0);

  return {
    orders: sorted,
    totalCount: sorted.length,
    stats: {
      totalRevenue,
      totalRefunds,
      cashTotal,
      onlineTotal,
      totalCancelled,
    },
  };
}
