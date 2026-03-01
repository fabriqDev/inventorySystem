---
name: Razorpay Payments Spec
overview: Razorpay integration via Supabase Edge Functions. Never Trust the Client; backend handles pricing and verification. create-razorpay-order, verify-payment, razorpay-webhook.
todos: []
isProject: false
---

# Razorpay Integration Specification: React Native & Supabase

## 1. Core Architecture

**"Never Trust the Client"** — the React Native app never calls Razorpay directly. Supabase Edge Functions are the backend.

| Layer | Responsibility |
|-------|----------------|
| **Frontend** | Invokes Supabase Edge Function, opens Razorpay SDK, calls verify |
| **Edge Function** | Auth, price calculation, Razorpay API call, DB writes |
| **Database** | Stores order status for reconciliation |
| **Webhook** | Safety net if app verify fails |

### Flow

1. **Frontend:** Calls `supabase.functions.invoke('create-razorpay-order', { body: { items, company_id } })`
2. **Edge Function:** Fetches prices, validates, creates Razorpay order, inserts into `orders`
3. **Frontend:** Opens Razorpay SDK with `razorpay_order_id` + `key_id`
4. **Frontend:** On success → `supabase.functions.invoke('verify-payment', { body: { ... } })`
5. **Edge Function:** Verifies HMAC, updates order status
6. **Webhook:** `payment.captured` → updates DB if app never called verify

---

## 2. Supabase Edge Functions

### A. create-razorpay-order

**Create:** `supabase functions new create-razorpay-order`

**Request body (App → Edge Function):**
```json
{
  "company_id": "uuid",
  "items": [
    { "sku": "IPHONE-15-PRO", "quantity": 1 },
    { "sku": "CASE-MAGSAFE", "quantity": 2 }
  ],
  "currency": "₹",
  "client_calculated_total": 145000
}
```

**Logic:** Get user from JWT → fetch prices from products → validate total → call Razorpay → insert orders → return `{ razorpay_order_id, amount_paise, key_id, internal_order_id }`

### B. verify-payment

**Request body:** `{ razorpay_payment_id, razorpay_order_id, razorpay_signature, internal_order_id }`  
**Logic:** HMAC verify, mark order PAID.

### C. razorpay-webhook

**URL:** `https://<project-ref>.supabase.co/functions/v1/razorpay-webhook`  
**Event:** `payment.captured` → update order to PAID if not already.

---

## 3. Database Schema

**orders:** id, company_id, user_id, rzp_order_id, status (`created`|`paid`|`failed`), amount, payment_id

---

## 4. Centralized Supabase Function Calls

All invocations in `lib/supabase-functions.ts`. See [SupabaseClientImpl.plan.md](SupabaseClientImpl.plan.md).

---

## 5. React Native Razorpay SDK

Options: `key`, `amount`, `order_id`, `currency`, `name`, `prefill`, `theme`

---

## 6. Edge Cases

| Scenario | Action |
|----------|--------|
| User cancels | BAD_REQUEST_ERROR — don't show "Order Placed" |
| Verify fails | "Awaiting Confirmation", retry, "Check Status" button |
| Webhook before verify | verify returns success (order already PAID) |
