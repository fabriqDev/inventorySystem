import type { OrderWithItems } from '@/core/types/order';

export interface SalesExportPdfInput {
  companyId: string;
  rangeLabel: string;
  dateFromIso: string;
  dateToIso: string;
  orders: OrderWithItems[];
}

/** Native: PDF export is web-only. */
export function downloadSalesOrdersPdf(_input: SalesExportPdfInput): void {
  // no-op
}
