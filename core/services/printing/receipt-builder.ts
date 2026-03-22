/**
 * Builds ESC/POS-style receipt text with simple tags for thermal printers
 * (e.g. <C> center, <B> bold). Seller name is static: Fabriq.
 *
 * IMPORTANT — thermal printers use limited code pages (typically CP437).
 * All text MUST be pure ASCII. Never use Unicode characters like ₹, …, –,
 * curly quotes, etc. — they will print as garbage (Chinese/Japanese glyphs).
 * Use "Rs." for currency and "..." for ellipsis.
 */

import type { CreateOrderResult } from '@/core/backend/types';
import { CURRENCY_DEFAULT } from '@/core/constants/currency';
import { formatAmount } from '@/core/services/format';
import { Strings } from '@/core/strings';
import type { CartTransactionType } from '@/core/types/cart';
import type { OrderWithItems } from '@/core/types/order';
import { CheckoutButton, getPaymentDisplayLabel, PAYMENT_CHECKOUT_MAP } from '@/core/types/order';

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
  /** When set, marks refund vs request on the receipt (thermal-safe tags). */
  transaction_type?: CartTransactionType;
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

/** Strip non-ASCII characters so thermal printers (CP437) don't print garbage glyphs. */
function ascii(text: string): string {
  return text.replace(/[^\x20-\x7E]/g, '');
}

/** Format amount for receipt display: "Rs. 125.00" or "Rs. -125.00". Sign always after symbol. */
function formatReceiptAmount(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${PRINT_CURRENCY_LABEL} ${sign}${formatAmount(Math.abs(amount))}`;
}

/** Prefix a line with left margin. Center tags already add their own spacing. */
function margin(line: string): string {
  if (line === '') return '';
  return RECEIPT_LEFT_MARGIN + line;
}

/** Format date for receipt — pure ASCII output safe for thermal printers. */
function formatReceiptDate(iso: string): string {
  const d = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const day = String(d.getDate()).padStart(2, '0');
  const mon = months[d.getMonth()];
  const year = d.getFullYear();
  const hr = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${mon} ${year}, ${hr}:${min}`;
}

/**
 * Build receipt string with thermal printer tags (<C> center, <B> bold, etc.)
 * for use with printBill() or printText().
 */
export function buildReceiptText(data: ReceiptData): string {
  const lines: string[] = [];

  lines.push('<CD>' + SELLER_NAME + '</CD>');
  lines.push('<C>----------------</C>');
  lines.push('');
  const orderId = ascii(data.orderId);
  lines.push(margin('Order #' + orderId));
  lines.push(margin(formatReceiptDate(data.createdAt)));
  lines.push(margin(data.isRefund ? 'Refund (Cash)' : 'Payment: ' + ascii(data.paymentMethod)));
  lines.push('');
  lines.push(margin('----------------'));

  const refundMark = ascii(Strings.company.receiptPrintRefundMark);
  const requestMark = ascii(Strings.company.receiptPrintRequestMark);

  for (const item of data.items) {
    const isRequestLine = item.transaction_type === 'request';
    const isRefundLine =
      item.transaction_type === 'refund' || (!isRequestLine && item.total < 0);
    const name = ascii(item.product_name);
    const truncated = name.length > 24 ? name.slice(0, 24) + '...' : name;
    const lineTag = isRefundLine ? refundMark : isRequestLine ? requestMark : '';
    lines.push(margin(truncated + (lineTag ? ' ' + lineTag : '')));
    const size = item.size?.trim();
    if (size) {
      lines.push(margin('  Size: ' + ascii(size)));
    }
    const code = item.article_code?.trim();
    const codePart = code ? ascii(code) + ' - ' : '';
    const unitDisplay = formatAmount(item.unit_price);
    const sign = isRefundLine ? '-' : '';
    const totalDisplay = formatAmount(Math.abs(item.total));
    lines.push(margin('  ' + codePart + `${item.quantity} x ${unitDisplay} = ${sign}${totalDisplay}`));
  }

  lines.push(margin('----------------'));
  lines.push(margin('Total: ' + formatReceiptAmount(data.total)));
  lines.push('');
  lines.push('<C>Thank you!</C>');
  lines.push('');
  lines.push('<C>' + ascii(Strings.company.receiptFootnote) + '</C>');
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
  transaction_type?: CartTransactionType;
}

/**
 * Convert OrderWithItems (e.g. from orders list) to ReceiptData for printing.
 * Uses server_order_id for receipt (prefer after order is successful).
 */
export function orderToReceiptData(order: OrderWithItems): ReceiptData {
  return {
    orderId: order.server_order_id ?? '',
    createdAt: order.created_at,
    items: order.items.map((i) => {
      const tt = i.transaction_type ?? (i.total < 0 ? 'refund' : 'sale');
      return {
        product_name: i.product_name,
        size: i.size,
        article_code: i.article_code,
        quantity: i.quantity,
        unit_price: i.unit_price,
        total: i.transaction_type === 'refund' ? -Math.abs(i.total) : i.total,
        transaction_type: tt,
      };
    }),
    subtotal: order.subtotal,
    total: order.total,
    paymentMethod: getPaymentDisplayLabel({
      payment_type: order.payment_type,
      payment_provider: order.payment_provider,
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
      transaction_type: i.transaction_type,
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
      { product_name: 'Test Product A', size: 'M', article_code: 'SKU-A', quantity: 2, unit_price: 50, total: 100 },
      { product_name: 'Test Product B', article_code: 'SKU-B', quantity: 1, unit_price: 25, total: 25 },
      {
        product_name: 'Test Request Line',
        article_code: 'SKU-C',
        quantity: 1,
        unit_price: 0,
        total: 0,
        transaction_type: 'request',
      },
      {
        product_name: 'Test Refund Line',
        article_code: 'SKU-D',
        quantity: 1,
        unit_price: 30,
        total: -30,
        transaction_type: 'refund',
      },
    ],
    subtotal: 95,
    total: 95,
    paymentMethod: getPaymentDisplayLabel(PAYMENT_CHECKOUT_MAP[CheckoutButton.CASH]),
    isRefund: false,
    currency: CURRENCY_DEFAULT,
  };
}
