import { Platform } from 'react-native';

export interface RazorpayOptions {
  /** Razorpay key_id (public key from company.razorpay_id). */
  key: string;
  /** Razorpay order ID returned by server createRazorpayOrder action. */
  order_id: string;
  /** Amount in paise (smallest currency unit). Caller must convert from rupees: Math.round(rupees * 100). */
  amount: number;
  currency: string;
  name: string;
  description?: string;
  prefill?: { email?: string; contact?: string; name?: string };
  theme?: { color?: string };
}

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export class RazorpayError extends Error {
  code: number;
  description: string;
  constructor(code: number, description: string) {
    super(description);
    this.name = 'RazorpayError';
    this.code = code;
    this.description = description;
  }
}

async function openNativeCheckout(options: RazorpayOptions): Promise<RazorpaySuccessResponse> {
  const RazorpayCheckout = (await import('react-native-razorpay')).default;
  try {
    const data = await RazorpayCheckout.open(options as any);
    return {
      razorpay_payment_id: data.razorpay_payment_id,
      razorpay_order_id: data.razorpay_order_id,
      razorpay_signature: data.razorpay_signature,
    };
  } catch (error: any) {
    const code = error?.code ?? error?.error?.code ?? 2;
    const desc = error?.description ?? error?.error?.description ?? 'Payment failed';
    throw new RazorpayError(code, desc);
  }
}

function loadCheckoutScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).Razorpay) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new RazorpayError(0, 'Failed to load Razorpay checkout'));
    document.body.appendChild(script);
  });
}

async function openWebCheckout(options: RazorpayOptions): Promise<RazorpaySuccessResponse> {
  await loadCheckoutScript();
  return new Promise<RazorpaySuccessResponse>((resolve, reject) => {
    const rzp = new (window as any).Razorpay({
      ...options,
      handler(response: any) {
        resolve({
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_signature: response.razorpay_signature,
        });
      },
      modal: {
        ondismiss() {
          reject(new RazorpayError(2, 'Payment cancelled by user'));
        },
      },
    });
    rzp.on('payment.failed', (resp: any) => {
      const meta = resp?.error ?? {};
      reject(new RazorpayError(meta.code ?? 1, meta.description ?? 'Payment failed'));
    });
    rzp.open();
  });
}

/**
 * Opens Razorpay checkout (native SDK on iOS/Android, checkout.js on web).
 * Resolves with payment_id, order_id, signature on success.
 * Throws RazorpayError on failure or dismissal (code=2 for user cancel).
 */
export function openRazorpayCheckout(options: RazorpayOptions): Promise<RazorpaySuccessResponse> {
  if (Platform.OS === 'web') return openWebCheckout(options);
  return openNativeCheckout(options);
}
