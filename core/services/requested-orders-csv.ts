import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import type { RequestedOrderPdfPage, RequestedOrdersPdfVariant } from '@/core/types/requested-orders';

function csvEscapeCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const CSV_BOM = '\uFEFF';

export function buildRequestedOrdersCsv(
  pages: RequestedOrderPdfPage[],
  variant: RequestedOrdersPdfVariant,
): string {
  const listLabel = variant === 'unfulfilled' ? 'Unfulfilled' : 'Fulfilled';
  const headers = [
    'List',
    'Order ID',
    'Order date',
    'Order total',
    'Product name',
    'Article code',
    'Size',
    'Quantity',
    'Unit price',
    'Line total',
    'Student name',
    'Student class',
    'Phone',
    'Fulfillment status',
  ];
  type Row = string[];
  const dataRows: Row[] = [];
  const sortedPages = [...pages].sort((a, b) => a.order_id.localeCompare(b.order_id));
  for (const p of sortedPages) {
    const lines = [...p.lines].sort((a, b) =>
      (a.product_name ?? '').localeCompare(b.product_name ?? '', undefined, { sensitivity: 'base' }),
    );
    for (const line of lines) {
      dataRows.push([
        listLabel,
        p.order_id,
        p.created_at ?? '',
        String(p.total ?? ''),
        (line.product_name ?? '').trim(),
        (line.article_code ?? '').trim(),
        (line.size ?? '').trim(),
        String(line.quantity ?? ''),
        String(line.unit_price ?? ''),
        String(line.total ?? ''),
        (line.student_name ?? '').trim(),
        (line.student_class ?? '').trim(),
        (line.phone_number ?? '').trim(),
        (line.fulfillment_status ?? '').trim(),
      ]);
    }
  }
  const linesOut = [headers.map(csvEscapeCell).join(',')];
  for (const r of dataRows) {
    linesOut.push(r.map(csvEscapeCell).join(','));
  }
  return linesOut.join('\r\n');
}

async function saveCsvAndShare(csvBody: string, filename: string): Promise<void> {
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
  if (!base) {
    throw new Error('No cache directory');
  }
  const path = `${base}${filename}`;
  await FileSystem.writeAsStringAsync(path, body, { encoding: 'utf8' });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
    });
  }
}

export type RequestedOrdersCsvExportResult = { ok: true } | { ok: false; reason: 'empty' | 'error' };

export async function exportRequestedOrdersCsv(
  pages: RequestedOrderPdfPage[],
  variant: RequestedOrdersPdfVariant,
  companyId: string,
): Promise<RequestedOrdersCsvExportResult> {
  try {
    if (pages.length === 0) {
      return { ok: false, reason: 'empty' };
    }
    const csv = buildRequestedOrdersCsv(pages, variant);
    const safeId = companyId.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 12) || 'company';
    const slug = variant === 'unfulfilled' ? 'unfulfilled' : 'fulfilled';
    const day = new Date().toISOString().slice(0, 10);
    const filename = `requested-items-${slug}-${safeId}-${day}.csv`;
    await saveCsvAndShare(csv, filename);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
