import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { formatAmount, formatDateTime, roundMoney } from '@/core/services/format';
import { Strings } from '@/core/strings';
import {
  getPaymentDisplayLabel,
  PaymentType,
  type OrderItem,
  type OrderStatusEnum,
  type OrderWithItems,
} from '@/core/types/order';

/** Cash/online split for order-level export columns (first line of each order only). */
export function getOrderExportPaymentAmounts(order: OrderWithItems): {
  cashAmount: number | null;
  onlineAmount: number | null;
} {
  const rawTotal = roundMoney(order.total ?? 0);
  const total = rawTotal < 0 ? rawTotal : rawTotal;
  const isRefundOrder = rawTotal < 0;
  const signed = (v: number) => (isRefundOrder ? -Math.abs(v) : Math.abs(v));
  if (order.payment_type === PaymentType.CASH) {
    return { cashAmount: signed(rawTotal), onlineAmount: null };
  }
  if (order.payment_type === PaymentType.ONLINE) {
    return { cashAmount: null, onlineAmount: signed(rawTotal) };
  }
  if (order.payment_type === PaymentType.SPLIT) {
    return {
      cashAmount: signed(roundMoney(order.cash_share ?? 0)),
      onlineAmount: signed(roundMoney(order.online_share ?? 0)),
    };
  }
  return { cashAmount: null, onlineAmount: null };
}

function lineItemExportKindLabel(transactionType: string | undefined): string {
  const t = (transactionType ?? 'sale').toLowerCase();
  if (t === 'request') return Strings.company.itemLineRequested;
  if (t === 'refund') return Strings.company.refund;
  return Strings.company.ordersExportLineStatusSale;
}

function csvEscapeCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const CSV_BOM = '\uFEFF';

function formatCustomerDetailsLine(details: unknown): string | null {
  if (details == null || typeof details !== 'object' || Array.isArray(details)) return null;
  const o = details as Record<string, unknown>;
  const take = (keys: string[]) => {
    for (const key of keys) {
      const v = o[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
  };
  const parts: string[] = [];
  const name = take(['student_name', 'name']);
  const cls = take(['student_class', 'class']);
  const parent = take(['parent_name']);
  const phone = take(['parent_phone', 'phone']);
  if (name) parts.push(name);
  if (cls) parts.push(cls);
  if (parent) parts.push(parent);
  if (phone) parts.push(phone);
  return parts.length > 0 ? parts.join(', ') : null;
}

export type OrdersExportTabFilter =
  | OrderStatusEnum
  | 'all'
  | 'refund'
  | 'cash'
  | 'online';

/** Same rules as the sales screen list filter (+ optional order id contains). */
export function filterOrdersForExport(
  orders: OrderWithItems[],
  filter: OrdersExportTabFilter,
  orderIdSearchRaw: string,
): OrderWithItems[] {
  let list: OrderWithItems[];
  if (filter === 'all') list = orders;
  else if (filter === 'refund') list = orders.filter((o) => o.refund_amount > 0);
  else if (filter === 'cash') list = orders.filter((o) => o.payment_type === PaymentType.CASH);
  else if (filter === 'online') {
    list = orders.filter(
      (o) => o.payment_type === PaymentType.ONLINE || o.payment_type === PaymentType.SPLIT,
    );
  } else list = orders.filter((o) => o.status === filter);

  const q = orderIdSearchRaw.trim().replace(/^#/, '').toLowerCase();
  if (!q) return list;
  return list.filter((o) => (o.server_order_id ?? '').toLowerCase().includes(q));
}

export function buildOrdersCsv(orders: OrderWithItems[]): string {
  const header = [
    'Order ID',
    'Created at',
    'Status',
    'Payment type',
    'Subtotal',
    'Total',
    'Refund amount',
    'Cash share',
    'Online share',
    'Customer details',
    'Notes',
  ];
  const lines = [header.map(csvEscapeCell).join(',')];
  const sorted = [...orders].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  for (const o of sorted) {
    const customer = formatCustomerDetailsLine(o.customer_details) ?? '';
    const notes = (o.notes ?? '').trim();
    const row = [
      String(o.server_order_id ?? ''),
      o.created_at ?? '',
      String(o.status ?? ''),
      getPaymentDisplayLabel(o),
      String(o.subtotal ?? 0),
      String(o.total ?? 0),
      String(o.refund_amount ?? 0),
      String(o.cash_share ?? 0),
      String(o.online_share ?? 0),
      customer,
      notes,
    ];
    lines.push(row.map(csvEscapeCell).join(','));
  }
  return lines.join('\r\n');
}

/** One CSV row per order line; order total shown once per order group (first line only). */
export function buildOrdersWithLineItemsCsv(orders: OrderWithItems[]): string {
  const header = [
    'OrderID',
    'Date&Time',
    'ArticelCode',
    'Article Name',
    'HSN Code',
    'Size',
    'Qunatity',
    'Item Price',
    'Line Item Price',
    'Payment type',
    'Order Total',
    'Cash Amount',
    'Online Amount',
    Strings.company.ordersExportLineItemKindColumn,
  ];
  const lines = [header.map(csvEscapeCell).join(',')];
  const sorted = [...orders].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  for (const o of sorted) {
    const orderId = String(o.server_order_id ?? '');
    const orderDateTime = o.created_at ? formatDateTime(o.created_at) : '';
    const payment = getPaymentDisplayLabel(o);
    const rawOrderTotal = roundMoney(o.total ?? 0);
    const isRefundOrder = rawOrderTotal < 0;
    const orderTotal = formatAmount(isRefundOrder ? -Math.abs(rawOrderTotal) : Math.abs(rawOrderTotal));
    const paymentAmounts = getOrderExportPaymentAmounts(o);
    const itemRows: (OrderItem | undefined)[] =
      o.items && o.items.length > 0 ? o.items : [undefined];
    for (let i = 0; i < itemRows.length; i++) {
      const line = itemRows[i];
      const qty = line?.quantity ?? 0;
      const unit = line?.unit_price ?? 0;
      const isRefundLine = (line?.transaction_type ?? '').toLowerCase() === 'refund';
      const exportQty = isRefundLine ? -Math.abs(qty) : qty;
      const lineItemTotal = roundMoney(exportQty * unit);
      const isFirstLine = i === 0;
      const row = [
        orderId,
        orderDateTime,
        line ? String(line.article_code ?? '') : '',
        line ? String(line.product_name ?? '') : '',
        line ? String((line as any).hsn_code ?? '') : '',
        line ? String(line.size ?? '') : '',
        line ? String(exportQty) : '',
        line ? formatAmount(unit) : '',
        line ? formatAmount(lineItemTotal) : '',
        payment,
        isFirstLine ? orderTotal : '',
        isFirstLine && paymentAmounts.cashAmount != null ? formatAmount(paymentAmounts.cashAmount) : '',
        isFirstLine && paymentAmounts.onlineAmount != null ? formatAmount(paymentAmounts.onlineAmount) : '',
        line ? lineItemExportKindLabel(line.transaction_type) : '',
      ];
      lines.push(row.map(csvEscapeCell).join(','));
    }
  }
  return lines.join('\r\n');
}

async function saveCsvAndOpenShareSheet(csvBody: string, filename: string): Promise<void> {
  const body = CSV_BOM + csvBody;
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || typeof Blob === 'undefined') return;
    const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;
  }
  const base = FileSystem.cacheDirectory;
  if (!base) throw new Error('No cache directory');
  const path = `${base}${filename}`;
  await FileSystem.writeAsStringAsync(path, body, { encoding: 'utf8' });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
    });
  }
}

export type OrdersCsvExportResult = { ok: true } | { ok: false; reason: 'empty' | 'error' };

export async function exportOrdersCsv(
  orders: OrderWithItems[],
  companyIdForFilename: string,
): Promise<OrdersCsvExportResult> {
  try {
    if (orders.length === 0) return { ok: false, reason: 'empty' };
    const csv = buildOrdersCsv(orders);
    const safeId = companyIdForFilename.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 12) || 'company';
    const day = new Date().toISOString().slice(0, 10);
    const filename = `orders-${safeId}-${day}.csv`;
    await saveCsvAndOpenShareSheet(csv, filename);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export async function exportOrdersWithLineItemsCsv(
  orders: OrderWithItems[],
  companyIdForFilename: string,
): Promise<OrdersCsvExportResult> {
  try {
    if (orders.length === 0) return { ok: false, reason: 'empty' };
    const csv = buildOrdersWithLineItemsCsv(orders);
    const safeId = companyIdForFilename.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 12) || 'company';
    const day = new Date().toISOString().slice(0, 10);
    const filename = `orders-line-items-${safeId}-${day}.csv`;
    await saveCsvAndOpenShareSheet(csv, filename);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
