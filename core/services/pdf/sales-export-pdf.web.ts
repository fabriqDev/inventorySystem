// Metro/SSR resolves `jspdf` to the node build (breaks bundling); use browser ES bundle.
import { jsPDF } from 'jspdf/dist/jspdf.es.min.js';

import { formatPrice } from '@/core/services/format';
import type { OrderItem, OrderWithItems } from '@/core/types/order';
import { getPaymentDisplayLabel } from '@/core/types/order';

import type { SalesExportPdfInput } from './sales-export-pdf';

const MARGIN = 16;
const LINE = 5.5;
const LINE_LOOSE = 7;
const TITLE_SIZE = 18;
const SECTION_SIZE = 12;
const BODY_SIZE = 10;
const DETAIL_SIZE = 9;

function ensureSpace(doc: jsPDF, y: number, minLines: number, pageH: number): number {
  if (y + minLines * LINE > pageH - MARGIN) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

/** One full page per order; long item lists may continue with extra pages inside the order. */
function writeOrderPage(doc: jsPDF, order: OrderWithItems, pageW: number, pageH: number): void {
  const currency = order.currency ?? 'INR';
  let y = MARGIN;

  doc.setFontSize(SECTION_SIZE);
  doc.setFont('helvetica', 'bold');
  doc.text(`Order #${order.server_order_id ?? ''}`, MARGIN, y);
  y += LINE_LOOSE + 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(BODY_SIZE);
  doc.text(`Date: ${order.created_at}`, MARGIN, y);
  y += LINE_LOOSE;
  doc.text(
    `Payment: ${getPaymentDisplayLabel({
      payment_type: order.payment_type,
      payment_provider: order.payment_provider,
    })}`,
    MARGIN,
    y,
  );
  y += LINE_LOOSE + 2;

  doc.setFontSize(BODY_SIZE);
  doc.text(`Subtotal: ${formatPrice(order.subtotal, currency)}`, MARGIN, y);
  y += LINE_LOOSE;
  doc.setFont('helvetica', 'bold');
  doc.text(`Total: ${formatPrice(order.total, currency)}`, MARGIN, y);
  doc.setFont('helvetica', 'normal');
  y += LINE_LOOSE + 2;

  doc.setDrawColor(180);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, pageW - MARGIN, y);
  y += LINE_LOOSE + 2;

  if (!order.items.length) {
    doc.setFontSize(DETAIL_SIZE);
    doc.setTextColor(100);
    doc.text('(No line items)', MARGIN, y);
    doc.setTextColor(0);
    return;
  }

  doc.setFontSize(DETAIL_SIZE);
  doc.setFont('helvetica', 'bold');
  doc.text('Items', MARGIN, y);
  y += LINE_LOOSE + 1;
  doc.setFont('helvetica', 'normal');

  for (const item of order.items) {
    y = writeLineItem(doc, item, currency, pageW, pageH, y);
  }
}

function writeLineItem(
  doc: jsPDF,
  item: OrderItem,
  currency: string,
  pageW: number,
  pageH: number,
  yIn: number,
): number {
  let y = ensureSpace(doc, yIn, 8, pageH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(BODY_SIZE);
  const name = item.product_name.trim() || '(Unnamed)';
  const nameLines = doc.splitTextToSize(name, pageW - 2 * MARGIN);
  for (const nl of nameLines) {
    y = ensureSpace(doc, y, 2, pageH);
    doc.text(nl, MARGIN, y);
    y += LINE_LOOSE;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(DETAIL_SIZE);
  const meta: string[] = [];
  if (item.article_code?.trim()) meta.push(`Code: ${item.article_code.trim()}`);
  if (item.size?.trim()) meta.push(`Size: ${item.size.trim()}`);
  if (item.transaction_type && item.transaction_type !== 'sale') {
    meta.push(String(item.transaction_type).toUpperCase());
  }
  if (meta.length) {
    y = ensureSpace(doc, y, 2, pageH);
    doc.setTextColor(80);
    doc.text(`  ${meta.join('   ·   ')}`, MARGIN, y);
    doc.setTextColor(0);
    y += LINE;
  }

  y = ensureSpace(doc, y, 2, pageH);
  const unitStr = formatPrice(item.unit_price, currency);
  const totStr = formatPrice(item.total, currency);
  doc.setFontSize(BODY_SIZE - 0.5);
  doc.text(`  ${unitStr} × ${item.quantity} = ${totStr}`, MARGIN, y);
  doc.setFontSize(DETAIL_SIZE);
  y += LINE_LOOSE + 4;

  return y;
}

export function downloadSalesOrdersPdf(input: SalesExportPdfInput): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = MARGIN;

  doc.setFontSize(TITLE_SIZE);
  doc.setFont('helvetica', 'bold');
  doc.text('Sales export', MARGIN, y);
  y += LINE_LOOSE + 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(BODY_SIZE);
  doc.text(`Company ID: ${input.companyId}`, MARGIN, y);
  y += LINE_LOOSE;
  doc.text(`Range: ${input.rangeLabel}`, MARGIN, y);
  y += LINE_LOOSE;
  doc.text(`From: ${input.dateFromIso}`, MARGIN, y);
  y += LINE_LOOSE;
  doc.text(`To: ${input.dateToIso}`, MARGIN, y);
  y += LINE_LOOSE;
  doc.text(`Generated: ${new Date().toISOString()}`, MARGIN, y);
  y += LINE_LOOSE;
  doc.setFont('helvetica', 'bold');
  doc.text(`Orders in file: ${input.orders.length}`, MARGIN, y);
  doc.setFont('helvetica', 'normal');

  for (const order of input.orders) {
    doc.addPage();
    writeOrderPage(doc, order, pageW, pageH);
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:-]/g, '').replace('T', '-');
  const filename = `sales-export-${input.companyId}-${stamp}.pdf`;
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
