---
name: Supabase Client Implementation
overview: Centralized Supabase Edge Function invocations. All supabase.functions.invoke() calls live in lib/supabase-functions.ts. No scattered calls in components.
todos: []
isProject: false
---

# Supabase Client Implementation: Centralized Function Calls

All Supabase Edge Function invocations from the React Native app must live in a **single file**.

---

## 1. File: lib/supabase-functions.ts

```ts
import { supabase } from '@/lib/supabase';

export const payments = {
  async createRazorpayOrder(params: {
    company_id: string;
    items: { sku: string; quantity: number }[];
    currency?: string;
    client_calculated_total: number;
  }) {
    const { data, error } = await supabase.functions.invoke('create-razorpay-order', { body: params });
    if (error) throw error;
    return data;
  },

  async verifyPayment(params: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
    internal_order_id: string;
  }) {
    const { data, error } = await supabase.functions.invoke('verify-payment', { body: params });
    if (error) throw error;
    return data;
  },
};
```

---

## 2. Usage

```ts
import { payments } from '@/lib/supabase-functions';
const res = await payments.createRazorpayOrder({ ... });
await payments.verifyPayment({ ... });
```

---

## 3. Rules

1. Single source: all `invoke()` calls in this file
2. No direct `invoke()` in components
3. Typed params per function
4. Grouped by domain: payments, companies, orders
