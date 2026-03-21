import { CartTransactionType } from './cart';

export type OrderStatusEnum = 'success' | 'failed' | 'pending';

// ── Payment type constants & type ────────────────────────────────────────────
export const PaymentType = {
  CASH: 'cash',
  ONLINE: 'online',
  SPLIT: 'split',
} as const;
export type PaymentTypeEnum = (typeof PaymentType)[keyof typeof PaymentType];

// ── Payment provider constants & type ────────────────────────────────────────
export const PaymentProvider = {
  NONE: 'none',
  RAZORPAY: 'rz_pg',
  PHONEPE: 'pe_pg',
  GENERIC_UPI: 'generic_upi',
} as const;
export type PaymentProviderEnum = (typeof PaymentProvider)[keyof typeof PaymentProvider];

// ── Checkout button constants & type ─────────────────────────────────────────
export const CheckoutButton = {
  CASH: 'Cash',
  ONLINE: 'Online',
  SPLIT: 'Split payment',
  RAZORPAY: 'Razorpay',
} as const;
export type PaymentButtonToShowEnum = (typeof CheckoutButton)[keyof typeof CheckoutButton];

export interface OrderPayment {
  payment_type: PaymentTypeEnum;
  payment_provider: PaymentProviderEnum;
  /** Amount paid in cash; set to total when payment is cash-only. */
  cash_share: number;
  /** Amount paid online or via PG; set to total when payment is online/PG. */
  online_share: number;
}

/**
 * Mapping from checkout button to payment_type and payment_provider only.
 * cash_share / online_share are computed by getOrderPaymentForCheckout using total (and split inputs for Split).
 */
export const PAYMENT_CHECKOUT_MAP: Record<PaymentButtonToShowEnum, Pick<OrderPayment, 'payment_type' | 'payment_provider'>> = {
  [CheckoutButton.CASH]: { payment_type: PaymentType.CASH, payment_provider: PaymentProvider.NONE },
  [CheckoutButton.ONLINE]: { payment_type: PaymentType.ONLINE, payment_provider: PaymentProvider.NONE },
  [CheckoutButton.SPLIT]: { payment_type: PaymentType.SPLIT, payment_provider: PaymentProvider.GENERIC_UPI },
  [CheckoutButton.RAZORPAY]: { payment_type: PaymentType.ONLINE, payment_provider: PaymentProvider.RAZORPAY },
};

/**
 * Compute OrderPayment with correct cash_share and online_share for checkout.
 * All amounts are in rupees (e.g. 4.50 = ₹4.50).
 * - Cash: cash_share = total, online_share = 0.
 * - Online / Razorpay: cash_share = 0, online_share = total.
 * - Split: use user-entered splitAmounts (cash_share, online_share); must sum to total.
 */
export function getOrderPaymentForCheckout(
  button: PaymentButtonToShowEnum,
  total: number,
  splitAmounts?: { cash_share: number; online_share: number }
): OrderPayment {
  const base = PAYMENT_CHECKOUT_MAP[button];
  if (button === CheckoutButton.CASH) {
    return { ...base, cash_share: total, online_share: 0 };
  }
  if (button === CheckoutButton.ONLINE || button === CheckoutButton.RAZORPAY) {
    return { ...base, cash_share: 0, online_share: total };
  }
  if (button === CheckoutButton.SPLIT && splitAmounts) {
    return { ...base, cash_share: splitAmounts.cash_share, online_share: splitAmounts.online_share };
  }
  return { ...base, cash_share: 0, online_share: 0 };
}

/** Derive the legacy payment_method string for API/display when backend expects a single value. */
export function toPaymentMethodValue(p: OrderPayment): string {
  if (p.payment_provider && p.payment_provider !== PaymentProvider.NONE) return p.payment_provider;
  return p.payment_type;
}

/** Default payment value when API/params omit it (Cash). */
export const DEFAULT_PAYMENT_METHOD_VALUE = toPaymentMethodValue({
  ...PAYMENT_CHECKOUT_MAP[CheckoutButton.CASH],
  cash_share: 0,
  online_share: 0,
});

/** Get display label key for payment (use with Strings.company[key]). */
export function getPaymentDisplayKey(p: { payment_type: PaymentTypeEnum; payment_provider: PaymentProviderEnum }): 'cash' | 'online' | 'onlinePg' | 'split' {
  if (p.payment_provider === PaymentProvider.RAZORPAY) return 'onlinePg';
  if (p.payment_type === PaymentType.SPLIT) return 'split';
  if (p.payment_type === PaymentType.ONLINE) return 'online';
  return 'cash';
}

const PAYMENT_DISPLAY_LABELS: Record<ReturnType<typeof getPaymentDisplayKey>, string> = {
  cash: 'Cash',
  online: 'Online',
  onlinePg: 'Online (PG)',
  split: 'Split',
};

/** Human-readable payment label: "Cash", "Online", "Online (PG)", or "Split". */
export function getPaymentDisplayLabel(p: { payment_type: PaymentTypeEnum; payment_provider: PaymentProviderEnum }): string {
  return PAYMENT_DISPLAY_LABELS[getPaymentDisplayKey(p)];
}

/** Map legacy API payment_method string to Order payment fields (e.g. when fetching orders). */
export function fromPaymentMethodValue(payment_method: string): OrderPayment {
  if (payment_method === PaymentProvider.RAZORPAY) {
    return { payment_type: PaymentType.ONLINE, payment_provider: PaymentProvider.RAZORPAY, cash_share: 0, online_share: 0 };
  }
  if (payment_method === PaymentProvider.PHONEPE) {
    return { payment_type: PaymentType.ONLINE, payment_provider: PaymentProvider.PHONEPE, cash_share: 0, online_share: 0 };
  }
  if (payment_method === PaymentProvider.GENERIC_UPI) {
    return { payment_type: PaymentType.SPLIT, payment_provider: PaymentProvider.GENERIC_UPI, cash_share: 0, online_share: 0 };
  }
  if (payment_method === PaymentType.ONLINE) {
    return { payment_type: PaymentType.ONLINE, payment_provider: PaymentProvider.NONE, cash_share: 0, online_share: 0 };
  }
  return { payment_type: PaymentType.CASH, payment_provider: PaymentProvider.NONE, cash_share: 0, online_share: 0 };
}

export interface Order {
  /** Server-generated id. Used for display, receipt, print, and all lookups. */
  server_order_id?: string;
  /** Razorpay order ID; set when payment goes through Razorpay PG. */
  razorpay_order_id?: string | null;
  company_id: string;
  user_id?: string;
  /** Reference to original order when this is a refund. */
  original_order_id?: string | null;
  subtotal: number;
  total: number;
  currency: string;
  payment_type: PaymentTypeEnum;
  payment_provider: PaymentProviderEnum;
  /** Amount paid in cash; updated when payment is cash or split. */
  cash_share: number;
  /** Amount paid online or via PG; updated when payment is online/PG or split. */
  online_share: number;
  status: OrderStatusEnum;
  created_at: string;
}

export interface OrderItem {
  /** Article/barcode code of the product; used for receipt and all lookups. */
  article_code: string;
  product_name: string;
  /** Size of product (e.g. S, M, L); used on receipt. */
  size?: string;
  quantity: number;
  unit_price: number;
  /** sale = deduct stock, refund = add stock; only at item level */
  transaction_type?: CartTransactionType;
  tax_percentage?: number;
  tax_amount?: number;
  total: number;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
}
