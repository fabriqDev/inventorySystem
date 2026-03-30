// Metro resolves `jspdf` to the node build on native; web bundle uses ES build.
import { jsPDF } from 'jspdf/dist/jspdf.es.min.js';

import { CURRENCY_DEFAULT } from '@/core/constants/currency';
import { formatAmount, formatDate, formatPrice } from '@/core/services/format';
import { Strings } from '@/core/strings';
import type {
  RequestedOrderLine,
  RequestedOrderPdfPage,
  RequestedOrdersPdfVariant,
} from '@/core/types/requested-orders';

import type { RequestedOrdersFulfillmentPdfInput } from './requested-orders-fulfillment-pdf';

const MARGIN = 16;
const LINE = 5.5;
const LINE_LOOSE = 7;
const TITLE_SIZE = 16;
const PDF_KIND_SIZE = 13;
const SECTION_SIZE = 11;
const BODY_SIZE = 10;
const DETAIL_SIZE = 9;

function recipientKey(l: RequestedOrderLine): string {
  return `${(l.student_name ?? '').trim()}\0${(l.student_class ?? '').trim()}\0${(l.phone_number ?? '').trim()}`;
}

function ensureSpace(doc: jsPDF, y: number, minLines: number, pageH: number): number {
  if (y + minLines * LINE > pageH - MARGIN) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function pdfVariantTitle(variant: RequestedOrdersPdfVariant): string {
  return variant === 'unfulfilled'
    ? Strings.company.unfulfilledOrders
    : Strings.company.fulfilledOrders;
}

function writeRequestedOrderPage(
  doc: jsPDF,
  order: RequestedOrderPdfPage,
  variant: RequestedOrdersPdfVariant,
  pageW: number,
  pageH: number,
): void {
  const currency = CURRENCY_DEFAULT;
  let y = MARGIN;

  doc.setFontSize(PDF_KIND_SIZE);
  doc.setFont('helvetica', 'bold');
  doc.text(pdfVariantTitle(variant), MARGIN, y);
  y += LINE_LOOSE + 1;

  doc.setFontSize(TITLE_SIZE);
  doc.text(`${Strings.company.requestedOrdersPdfOrderLabel} #${order.order_id}`, MARGIN, y);
  y += LINE_LOOSE + 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(BODY_SIZE);
  doc.text(`${Strings.company.requestedOrdersPdfDateLabel}: ${formatDate(order.created_at)}`, MARGIN, y);
  y += LINE_LOOSE;
  doc.text(
    `${Strings.company.requestedOrdersPdfOrderTotalLabel}: ${formatPrice(order.total, currency)}`,
    MARGIN,
    y,
  );
  y += LINE_LOOSE + 2;

  const lines = order.lines;
  const keys = new Set(lines.map(recipientKey));
  const singleRecipient = keys.size === 1 ? lines[0] : null;

  doc.setFontSize(SECTION_SIZE);
  doc.setFont('helvetica', 'bold');
  doc.text(Strings.company.requestedOrdersPdfMetaSection, MARGIN, y);
  y += LINE_LOOSE + 1;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(BODY_SIZE);

  if (singleRecipient) {
    const sn = (singleRecipient.student_name ?? '').trim() || '—';
    const sc = (singleRecipient.student_class ?? '').trim() || '—';
    const ph = (singleRecipient.phone_number ?? '').trim();
    y = ensureSpace(doc, y, 5, pageH);
    doc.text(`${Strings.company.requestSearchStudentLabel}: ${sn}`, MARGIN, y);
    y += LINE_LOOSE;
    doc.text(`${Strings.company.requestSearchClassLabel}: ${sc}`, MARGIN, y);
    y += LINE_LOOSE;
    if (ph) {
      doc.text(`${Strings.company.requestSearchPhoneLabel}: ${ph}`, MARGIN, y);
      y += LINE_LOOSE;
    }
  } else {
    y = ensureSpace(doc, y, 3, pageH);
    doc.setTextColor(90);
    doc.text(Strings.company.multipleStudentsNote, MARGIN, y);
    doc.setTextColor(0);
    y += LINE_LOOSE + 2;
  }

  doc.setDrawColor(180);
  doc.setLineWidth(0.3);
  y = ensureSpace(doc, y, 2, pageH);
  doc.line(MARGIN, y, pageW - MARGIN, y);
  y += LINE_LOOSE + 2;

  doc.setFontSize(SECTION_SIZE);
  doc.setFont('helvetica', 'bold');
  doc.text(
    variant === 'unfulfilled'
      ? Strings.company.requestedOrdersPdfItemsSection
      : Strings.company.requestedOrdersPdfItemsSectionFulfilled,
    MARGIN,
    y,
  );
  y += LINE_LOOSE + 2;
  doc.setFont('helvetica', 'normal');

  const showPerItemMeta = singleRecipient == null;

  for (const item of lines) {
    y = ensureSpace(doc, y, 10, pageH);

    doc.setFontSize(BODY_SIZE);
    doc.setFont('helvetica', 'bold');
    const name = (item.product_name ?? '').trim() || '(Unnamed)';
    for (const nl of doc.splitTextToSize(name, pageW - 2 * MARGIN)) {
      y = ensureSpace(doc, y, 2, pageH);
      doc.text(nl, MARGIN, y);
      y += LINE_LOOSE;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(DETAIL_SIZE);
    const bits: string[] = [];
    if (item.article_code?.trim()) {
      bits.push(`${Strings.company.articleCode}: ${item.article_code.trim()}`);
    }
    if (item.size?.trim()) {
      bits.push(`${Strings.company.size}: ${item.size.trim()}`);
    }
    bits.push(`${Strings.company.requestedOrdersPdfQuantityLabel}: ${item.quantity}`);
    y = ensureSpace(doc, y, 2, pageH);
    doc.setTextColor(80);
    doc.text(bits.join('   ·   '), MARGIN, y);
    doc.setTextColor(0);
    y += LINE;
    y = ensureSpace(doc, y, 2, pageH);
    doc.text(
      `  ${formatAmount(item.unit_price)} × ${item.quantity} = ${formatAmount(item.total)}`,
      MARGIN,
      y,
    );
    y += LINE;

    if (showPerItemMeta) {
      const sn = (item.student_name ?? '').trim() || '—';
      const sc = (item.student_class ?? '').trim() || '—';
      const ph = (item.phone_number ?? '').trim();
      y = ensureSpace(doc, y, 4, pageH);
      doc.text(`  ${Strings.company.requestSearchStudentLabel}: ${sn}`, MARGIN, y);
      y += LINE;
      doc.text(`  ${Strings.company.requestSearchClassLabel}: ${sc}`, MARGIN, y);
      y += LINE;
      if (ph) {
        doc.text(`  ${Strings.company.requestSearchPhoneLabel}: ${ph}`, MARGIN, y);
        y += LINE;
      }
    }

    y += LINE;
  }
}

export function downloadRequestedOrdersFulfillmentPdf(input: RequestedOrdersFulfillmentPdfInput): void {
  if (input.pages.length === 0) return;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  for (let i = 0; i < input.pages.length; i += 1) {
    if (i > 0) doc.addPage();
    writeRequestedOrderPage(doc, input.pages[i], input.variant, pageW, pageH);
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:-]/g, '').replace('T', '-');
  const safeCo = input.companyId.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 12) || 'company';
  const slug = input.variant === 'unfulfilled' ? 'unfulfilled' : 'fulfilled';
  const filename = `requested-items-${slug}-${safeCo}-${stamp}.pdf`;
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
