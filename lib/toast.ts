export type ToastType = 'error' | 'success' | 'info';

export type ToastPayload = {
  type: ToastType;
  message: string;
  durationMs?: number;
};

type Listener = (toast: ToastPayload | null) => void;

let current: ToastPayload | null = null;
const listeners = new Set<Listener>();
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function notify() {
  for (const l of listeners) l(current);
}

export const toast = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    listener(current);
    return () => listeners.delete(listener);
  },

  show(payload: ToastPayload) {
    current = payload;
    notify();

    if (hideTimer) clearTimeout(hideTimer);
    const duration = payload.durationMs ?? (payload.type === 'error' ? 4500 : 2500);
    hideTimer = setTimeout(() => {
      current = null;
      notify();
    }, duration);
  },

  hide() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    current = null;
    notify();
  },
};

