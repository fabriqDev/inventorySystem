import { useCompany } from '@/core/context/company-context';
import type { CompanyConfig } from '@/core/types/company';

/**
 * Returns resolved feature flags for the currently selected company.
 * All values fall back to safe defaults when the server omits a field.
 */
export function useCompanyConfig(): Required<CompanyConfig> {
  const { selectedCompany } = useCompany();
  const config = selectedCompany?.config ?? {};

  return {
    /** Barcode/QR scanning is enabled unless the server explicitly sends false. */
    show_barcode: config.show_barcode !== false,
    /** Requested items feature is enabled unless the server explicitly sends false. */
    show_requested: config.show_requested !== false,
    /** Buyer details form at checkout is disabled unless the server explicitly sends true. */
    ask_order_buyer_details: config.ask_order_buyer_details === true,
  };
}
