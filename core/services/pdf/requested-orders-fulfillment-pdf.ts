import type { RequestedOrderPdfPage, RequestedOrdersPdfVariant } from '@/core/types/requested-orders';

export interface RequestedOrdersFulfillmentPdfInput {
  companyId: string;
  variant: RequestedOrdersPdfVariant;
  pages: RequestedOrderPdfPage[];
}

/** Native: PDF uses jsPDF on web only. */
export function downloadRequestedOrdersFulfillmentPdf(_input: RequestedOrdersFulfillmentPdfInput): void {
  // no-op
}
