import { CURRENCY_DEFAULT } from '@/core/constants/currency';

export function formatPrice(paise: number, currency: string = CURRENCY_DEFAULT): string {
  return `${currency} ${(paise / 100).toFixed(2)}`;
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
