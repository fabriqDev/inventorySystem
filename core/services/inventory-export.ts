import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { getAvailableStock, type Product } from '@/core/types/product';

function csvEscapeCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** UTF-8 BOM so Excel opens special characters correctly on Windows. */
const CSV_BOM = '\uFEFF';

/**
 * Build CSV: Product name, Article code, Quantity (available sellable units), Size.
 * Opens in Excel; `.csv` extension.
 */
export function buildInventoryCsv(products: Product[]): string {
  const header = ['Product name', 'Article code', 'Quantity', 'Size'];
  const lines = [header.map(csvEscapeCell).join(',')];
  const sorted = [...products].sort((a, b) =>
    (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }),
  );
  for (const p of sorted) {
    const name = (p.name ?? '').trim();
    const article = (p.article_code?.trim() || p.scan_code?.trim() || '').trim();
    const qty = String(getAvailableStock(p));
    const size = (p.size ?? '').trim();
    lines.push([name, article, qty, size].map(csvEscapeCell).join(','));
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

export type InventoryExportResult = { ok: true } | { ok: false; reason: 'empty' | 'error' };

/** Writes CSV from an in-memory list (e.g. company cache with same filters as the inventory UI). */
export async function exportInventoryCsv(
  products: Product[],
  companyIdForFilename: string,
): Promise<InventoryExportResult> {
  try {
    if (products.length === 0) {
      return { ok: false, reason: 'empty' };
    }
    const csv = buildInventoryCsv(products);
    const safeId = companyIdForFilename.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 12) || 'company';
    const day = new Date().toISOString().slice(0, 10);
    const filename = `inventory-${safeId}-${day}.csv`;
    await saveCsvAndOpenShareSheet(csv, filename);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
