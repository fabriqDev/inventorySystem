import { CURRENCY_DEFAULT } from '@/core/constants/currency';

const DECIMAL_PLACES = 2;
const MULTIPLIER = Math.pow(10, DECIMAL_PLACES);

/** Round a monetary value to 2 decimal places. Use for all rupee calculations. */
export function roundMoney(value: number): number {
  return Math.round(value * MULTIPLIER) / MULTIPLIER;
}

/** Format a numeric amount as a decimal string (e.g. 4.5 → "4.50"). No currency symbol. */
export function formatAmount(value: number): string {
  return roundMoney(value).toFixed(DECIMAL_PLACES);
}

/** Format a price with currency symbol (e.g. 4.5 → "₹ 4.50"). */
export function formatPrice(amount: number, currency: string = CURRENCY_DEFAULT): string {
  return `${currency} ${formatAmount(amount)}`;
}

export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function truncateId(id: string, len = 8): string {
  return id.length > len ? `${id.slice(0, len)}…` : id;
}
