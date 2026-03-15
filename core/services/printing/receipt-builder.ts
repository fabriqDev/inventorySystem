/**
 * Builds ESC/POS-style receipt text with simple tags for thermal printers
 * (e.g. <C> center, <B> bold). Seller name is static: Fabriq.
 *
 * Thermal printers often use limited code pages; we use "Rs." instead of ₹
 * so the currency symbol prints reliably. Left margin is applied to all
 * lines so the bill is not flush to the paper edge.
 */

import type { CreateOrderResult } from '@/core/backend/types';
import { CURRENCY_DEFAULT } from '@/core/constants/currency';
import { Strings } from '@/core/strings';
import type { OrderWithItems } from '@/core/types/order';
import { CheckoutButton, PAYMENT_CHECKOUT_MAP, toPaymentMethodValue } from '@/core/types/order';

const SELLER_NAME = 'FabrIQ';

/** Left margin for printed bill (thermal printers); use spaces so content is not flush to edge. */
const RECEIPT_LEFT_MARGIN = '  ';

/**
 * Currency label for printed output. Use "Rs." instead of ₹ so thermal
 * printers without Unicode support still show the symbol correctly.
 */
const PRINT_CURRENCY_LABEL = 'Rs.';


export interface ReceiptLineItem {
  product_name: string;
  /** Size of product (e.g. S, M, L); printed below product name when present. */
  size?: string;
  /** Article code; printed as "Code - Qty * unit price = total" line. */
  article_code?: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface ReceiptData {
  orderId: string;
  createdAt: string;
  items: ReceiptLineItem[];
  subtotal: number;
  total: number;
  paymentMethod: string;
  isRefund?: boolean;
  currency?: string;
}

/** Format amount for receipt (paise to display string). Uses PRINT_CURRENCY_LABEL for reliable thermal print. */
function formatAmount(paise: number, _currency?: string): string {
  return `${PRINT_CURRENCY_LABEL} ${(paise / 100).toFixed(2)}`;
}

/** Prefix a line with left margin. Center tags already add their own spacing. */
function margin(line: string): string {
  if (line === '') return '';
  return RECEIPT_LEFT_MARGIN + line;
}

/** Format date for receipt */
function formatReceiptDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Build receipt string with thermal printer tags (<C> center, <B> bold, etc.)
 * for use with printBill() or printText().
 */
export function buildReceiptText(data: ReceiptData): string {
  const lines: string[] = [];

  lines.push('<C><B>' + SELLER_NAME + '</B></C>');
  lines.push('<C>----------------</C>');
  lines.push('');
  lines.push(margin('Order #' + (data.orderId.length > 12 ? data.orderId.slice(0, 12) + '…' : data.orderId)));
  lines.push(margin(formatReceiptDate(data.createdAt)));
  lines.push(margin(data.isRefund ? 'Refund (Cash)' : 'Payment: ' + data.paymentMethod));
  lines.push('');
  lines.push(margin('----------------'));

  for (const item of data.items) {
    // 1 - Product name
    const name = item.product_name.length > 24 ? item.product_name.slice(0, 24) + '…' : item.product_name;
    lines.push(margin(name));
    // 2 - Size of product (if present)
    if (item.size?.trim()) {
      lines.push(margin('Size: ' + item.size.trim()));
    }
    // 3 - Article code - Quantity * unit price = total
    const codePart = item.article_code?.trim() ? item.article_code.trim() + ' - ' : '';
    const unitDisplay = (item.unit_price / 100).toFixed(2);
    const totalDisplay = (item.total / 100).toFixed(2);
    lines.push(margin('  ' + codePart + `${item.quantity} x ${unitDisplay} = ${PRINT_CURRENCY_LABEL} ${totalDisplay}`));
  }

  lines.push(margin('----------------'));
  lines.push(margin('<B>Total: ' + formatAmount(data.total) + '</B>'));
  lines.push('');
  lines.push('<C>Thank you!</C>');
  lines.push('');
  lines.push('<C>' + Strings.company.receiptFootnote + '</C>');
  lines.push('');

  return lines.join('\n');
}

/** Cart item shape for checkout result (no product id needed for receipt) */
export interface CheckoutCartItem {
  product_name: string;
  size?: string;
  article_code?: string;
  quantity: number;
  unit_price: number;
  total: number;
}

/**
 * Convert OrderWithItems (e.g. from orders list) to ReceiptData for printing.
 * Uses server_order_id for receipt (prefer after order is successful).
 */
export function orderToReceiptData(order: OrderWithItems): ReceiptData {
  return {
    orderId: order.server_order_id ?? '',
    createdAt: order.created_at,
    items: order.items.map((i) => ({
      product_name: i.product_name,
      size: i.size,
      article_code: i.article_code,
      quantity: i.quantity,
      unit_price: i.unit_price,
      total: i.total,
    })),
    subtotal: order.subtotal,
    total: order.total,
    paymentMethod: toPaymentMethodValue({
      payment_type: order.payment_type,
      payment_provider: order.payment_provider,
      cash_share: order.cash_share,
      online_share: order.online_share,
    }),
    isRefund: order.total < 0,
    currency: order.currency,
  };
}

/**
 * Convert checkout result + cart items to ReceiptData (for printing right after payment success).
 */
export function checkoutResultToReceiptData(
  result: CreateOrderResult,
  cartItems: CheckoutCartItem[],
  paymentMethod: string,
  options?: { isRefund?: boolean; currency?: string }
): ReceiptData {
  const isRefund = options?.isRefund ?? false;
  const currency = options?.currency ?? CURRENCY_DEFAULT;
  return {
    orderId: result.server_order_id,
    createdAt: new Date().toISOString(),
    items: cartItems.map((i) => ({
      product_name: i.product_name,
      size: i.size,
      article_code: i.article_code,
      quantity: i.quantity,
      unit_price: i.unit_price,
      total: i.total,
    })),
    subtotal: result.total,
    total: result.total,
    paymentMethod,
    isRefund,
    currency,
  };
}

/** Mock order data for testing printer (always the same) */
export function getMockReceiptData(): ReceiptData {
  const now = new Date().toISOString();
  return {
    orderId: 'MOCK-' + Date.now().toString(36).toUpperCase(),
    createdAt: now,
    items: [
      { product_name: 'Test Product A', size: 'M', article_code: 'SKU-A', quantity: 2, unit_price: 5000, total: 10000 },
      { product_name: 'Test Product B', article_code: 'SKU-B', quantity: 1, unit_price: 2500, total: 2500 },
    ],
    subtotal: 12500,
    total: 12500,
    paymentMethod: toPaymentMethodValue({ ...PAYMENT_CHECKOUT_MAP[CheckoutButton.CASH], cash_share: 0, online_share: 0 }),
    isRefund: false,
    currency: CURRENCY_DEFAULT,
  };
}
