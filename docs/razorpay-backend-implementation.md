# Razorpay Backend Implementation Guide

This document describes **every backend change** required to support the Razorpay payment flow that has been implemented on the client (React Native / Expo).

---

## Table of Contents

1. [Database Schema Changes](#1-database-schema-changes)
2. [Update COMPANIES_QUERY — Expose `razorpay_id`](#2-update-companies-query--expose-razorpay_id)
3. [Hasura Action: `createRazorpayOrder`](#3-hasura-action-createrazorpayorder)
4. [Hasura Action: `verifyRazorpayPayment`](#4-hasura-action-verifyrazorpaypayment)
5. [Hasura Mutation: `updateOrderStatus`](#5-hasura-mutation-updateorderstatus)
6. [Razorpay Webhook Handler](#6-razorpay-webhook-handler)
7. [Reconciliation Cron Job](#7-reconciliation-cron-job)
8. [Environment Variables / Secrets](#8-environment-variables--secrets)
9. [Client ↔ Backend Flow Summary](#9-client--backend-flow-summary)
10. [Security Checklist](#10-security-checklist)

---

## 1. Database Schema Changes

### 1.1 `companies` table — add `razorpay_id` column

The client reads `razorpay_id` from the company object to decide whether to show the Razorpay payment button. If the field is `null` or empty, the button is hidden.

```sql
ALTER TABLE companies
  ADD COLUMN razorpay_id TEXT DEFAULT NULL;

COMMENT ON COLUMN companies.razorpay_id IS
  'Razorpay Key ID (key_id from Razorpay Dashboard). When set, online PG payments are enabled for this company.';
```

**Also store the secret separately** (never exposed to client):

```sql
ALTER TABLE companies
  ADD COLUMN razorpay_secret TEXT DEFAULT NULL;

COMMENT ON COLUMN companies.razorpay_secret IS
  'Razorpay Key Secret. Used server-side only for order creation and signature verification. NEVER expose to client.';
```

> **Hasura permissions**: `razorpay_id` should be readable by authenticated users (needed on client). `razorpay_secret` must have **no select permission** — only accessible by Hasura Actions / server-side code.

### 1.2 `order_history` table — add new columns

The client already sends these fields when creating orders. Ensure the table has them:

```sql
-- Payment breakdown columns (may already exist)
ALTER TABLE order_history
  ADD COLUMN IF NOT EXISTS payment_type    TEXT NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS cash_share      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS online_share    INTEGER NOT NULL DEFAULT 0;

-- Razorpay-specific columns
ALTER TABLE order_history
  ADD COLUMN IF NOT EXISTS razorpay_order_id   TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT DEFAULT NULL;

-- Order status (may already exist; ensure 'pending' is a valid value)
-- Current valid values: 'success', 'failed', 'pending'
ALTER TABLE order_history
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'success';
```

| Column | Type | Description |
|--------|------|-------------|
| `payment_type` | `text` | `'cash'`, `'online'`, or `'split'` |
| `payment_provider` | `text` | `'none'`, `'rz_pg'`, `'pe_pg'`, `'generic_upi'` |
| `cash_share` | `numeric` | Amount in rupees paid via cash |
| `online_share` | `numeric` | Amount in rupees paid online/PG |
| `razorpay_order_id` | `text` | Razorpay `order_xxxxx` ID (set after Razorpay order creation) |
| `razorpay_payment_id` | `text` | Razorpay `pay_xxxxx` ID (set after payment verification) |
| `status` | `text` | `'pending'` → `'success'` or `'failed'` |

---

## 2. Update COMPANIES_QUERY — Expose `razorpay_id`

The client's `COMPANIES_QUERY` currently does **not** fetch `razorpay_id`. You need to:

### 2.1 Hasura — allow `razorpay_id` in select permissions

In Hasura Console → `companies` table → Permissions → the relevant role (e.g. `user`):
- Add `razorpay_id` to the **select** columns

### 2.2 Client query needs this field

Once the column exists and permissions are set, the existing client mapper at `nhost.ts:525` will automatically pick it up:

```
razorpay_id: company.razorpay_id ?? undefined
```

But the `COMPANIES_QUERY` GraphQL also needs the field added. **This is a frontend fix** — add `razorpay_id` inside the `company { ... }` selection:

```graphql
query GetCompanies($userId: uuid!) {
  assigned_companies: user_company_roles(where: { user_id: { _eq: $userId } }) {
    company {
      id
      name: company_name
      slug: company_code
      address
      razorpay_id          # ← ADD THIS
      created_at
      updated_at
    }
    access_role {
      role_type
      visible_tiles
    }
  }
}
```

---

## 3. Hasura Action: `createRazorpayOrder`

### What the client sends

```graphql
mutation CreateRazorpayOrder($server_order_id: uuid!, $amount: Int!, $currency: String!) {
  createRazorpayOrder(server_order_id: $server_order_id, amount: $amount, currency: $currency) {
    razorpay_order_id
  }
}
```

### 3.1 Define the Hasura Action

In Hasura Console → Actions → Create:

**Action name**: `createRazorpayOrder`

**Action definition**:
```graphql
type Mutation {
  createRazorpayOrder(
    server_order_id: uuid!
    amount: Int!
    currency: String!
  ): CreateRazorpayOrderOutput!
}
```

**Output type**:
```graphql
type CreateRazorpayOrderOutput {
  razorpay_order_id: String!
}
```

**Handler URL**: `{{NHOST_FUNCTIONS_URL}}/razorpay/create-order` (or your serverless function URL)

### 3.2 Handler Implementation (Node.js / Nhost Serverless Function)

```javascript
// functions/razorpay/create-order.js
import Razorpay from 'razorpay';

export default async function handler(req, res) {
  const { server_order_id, amount, currency } = req.body.input;

  // 1. Look up the order to get company_id
  //    (use Hasura admin SDK or direct DB query)
  const order = await fetchOrderById(server_order_id);
  if (!order) return res.status(400).json({ message: 'Order not found' });
  if (order.status !== 'pending') return res.status(400).json({ message: 'Order is not pending' });

  // 2. Look up company's razorpay credentials
  const company = await fetchCompanyById(order.company_id);
  if (!company.razorpay_id || !company.razorpay_secret) {
    return res.status(400).json({ message: 'Razorpay not configured for this company' });
  }

  // 3. Create Razorpay order via Razorpay API
  const razorpay = new Razorpay({
    key_id: company.razorpay_id,
    key_secret: company.razorpay_secret,
  });

  const rzOrder = await razorpay.orders.create({
    amount: Math.round(amount * 100), // convert rupees to paise for Razorpay API
    currency: currency,
    receipt: server_order_id, // link back to our order
    notes: {
      server_order_id: server_order_id,
      company_id: order.company_id,
    },
  });

  // 4. Save razorpay_order_id back to order_history
  await updateOrder(server_order_id, {
    razorpay_order_id: rzOrder.id,
  });

  // 5. Return to client
  return res.json({ razorpay_order_id: rzOrder.id });
}
```

**Key points**:
- `amount` is in **rupees** from the client — the backend must convert to **paise** (`amount * 100`) before calling Razorpay API
- Store `razorpay_order_id` on the `order_history` row immediately
- Validate that the order exists and is in `pending` status before creating a Razorpay order

---

## 4. Hasura Action: `verifyRazorpayPayment`

### What the client sends

```graphql
mutation VerifyRazorpayPayment(
  $server_order_id: uuid!
  $razorpay_order_id: String!
  $razorpay_payment_id: String!
  $razorpay_signature: String!
) {
  verifyRazorpayPayment(
    server_order_id: $server_order_id
    razorpay_order_id: $razorpay_order_id
    razorpay_payment_id: $razorpay_payment_id
    razorpay_signature: $razorpay_signature
  ) {
    success
    status
  }
}
```

### 4.1 Define the Hasura Action

**Action name**: `verifyRazorpayPayment`

**Action definition**:
```graphql
type Mutation {
  verifyRazorpayPayment(
    server_order_id: uuid!
    razorpay_order_id: String!
    razorpay_payment_id: String!
    razorpay_signature: String!
  ): VerifyRazorpayPaymentOutput!
}
```

**Output type**:
```graphql
type VerifyRazorpayPaymentOutput {
  success: Boolean!
  status: String!
}
```

**Handler URL**: `{{NHOST_FUNCTIONS_URL}}/razorpay/verify-payment`

### 4.2 Handler Implementation

```javascript
// functions/razorpay/verify-payment.js
import crypto from 'crypto';

export default async function handler(req, res) {
  const {
    server_order_id,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = req.body.input;

  // 1. Fetch order and company
  const order = await fetchOrderById(server_order_id);
  if (!order) return res.status(400).json({ message: 'Order not found' });

  const company = await fetchCompanyById(order.company_id);
  if (!company.razorpay_secret) {
    return res.json({ success: false, status: 'failed' });
  }

  // 2. Verify HMAC SHA256 signature
  //    signature = HMAC_SHA256(razorpay_order_id + "|" + razorpay_payment_id, key_secret)
  const expectedSignature = crypto
    .createHmac('sha256', company.razorpay_secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  const isValid = expectedSignature === razorpay_signature;

  if (isValid) {
    // 3a. Signature valid → mark order as success
    await updateOrder(server_order_id, {
      status: 'success',
      razorpay_payment_id: razorpay_payment_id,
    });
    return res.json({ success: true, status: 'success' });
  } else {
    // 3b. Signature mismatch → DO NOT mark as failed (money may still be deducted)
    //     Leave as 'pending' for webhook/reconciliation to resolve
    console.error(`Signature mismatch for order ${server_order_id}`);
    return res.json({ success: false, status: 'pending' });
  }
}
```

**Critical**: On signature mismatch, do **not** mark the order as `failed`. The payment may have actually succeeded — leave it `pending` so the webhook or reconciliation job can resolve it.

---

## 5. Hasura Mutation: `updateOrderStatus`

This uses a **direct Hasura mutation** (not an Action), already defined:

```graphql
mutation UpdateOrderStatus($orderId: uuid!, $status: String!) {
  update_order_history_by_pk(
    pk_columns: { order_id: $orderId }
    _set: { status: $status }
  ) {
    order_id
    status
  }
}
```

### What to configure in Hasura

Ensure the `update` permission for the `order_history` table allows setting the `status` column for authenticated users. The client uses this to:

- Mark an order as `failed` when the user cancels before payment
- This is **not** used after successful payment — verification handles that

### Permission guard (recommended)

Only allow status transitions that make sense:

| Current status | Allowed new status |
|---|---|
| `pending` | `failed` (user cancelled) |
| `pending` | `success` (verified by server) |
| `success` | — (immutable) |
| `failed` | — (immutable) |

You can enforce this via a Hasura check constraint or in a pre-update trigger.

---

## 6. Razorpay Webhook Handler

The webhook is your **safety net** for cases where:
- Client verification call fails (network issue)
- Client app crashes after SDK success
- Signature mismatch on client verify but payment actually went through

### 6.1 Register Webhook in Razorpay Dashboard

Go to **Razorpay Dashboard → Settings → Webhooks → Add New Webhook**:

- **URL**: `https://<your-nhost-domain>/v1/functions/razorpay/webhook`
- **Secret**: Generate a webhook secret and store it in your env vars
- **Events to subscribe**:
  - `payment.captured` — payment was successfully captured
  - `payment.failed` — payment definitively failed
  - `order.paid` — entire order amount was paid (useful for partial payments)

### 6.2 Handler Implementation

```javascript
// functions/razorpay/webhook.js
import crypto from 'crypto';

export default async function handler(req, res) {
  // 1. Verify webhook signature
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const receivedSignature = req.headers['x-razorpay-signature'];

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (receivedSignature !== expectedSignature) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const event = req.body.event;
  const payload = req.body.payload;

  // 2. Handle events
  if (event === 'payment.captured') {
    const payment = payload.payment.entity;
    const razorpayOrderId = payment.order_id;
    const razorpayPaymentId = payment.id;

    // Find our order by razorpay_order_id
    const order = await fetchOrderByRazorpayOrderId(razorpayOrderId);
    if (order && order.status === 'pending') {
      await updateOrder(order.order_id, {
        status: 'success',
        razorpay_payment_id: razorpayPaymentId,
      });
    }
  }

  if (event === 'payment.failed') {
    const payment = payload.payment.entity;
    const razorpayOrderId = payment.order_id;

    const order = await fetchOrderByRazorpayOrderId(razorpayOrderId);
    if (order && order.status === 'pending') {
      await updateOrder(order.order_id, {
        status: 'failed',
      });
    }
  }

  // Always return 200 to Razorpay (they retry on non-2xx)
  return res.status(200).json({ ok: true });
}
```

**Key points**:
- Always verify the webhook signature before processing
- Only update orders that are still `pending` (idempotency)
- Always return `200` — Razorpay retries on failure, which could cause duplicate processing

---

## 7. Reconciliation Cron Job

For orders stuck in `pending` beyond a reasonable time (e.g. 30 minutes), run a cron job:

### Purpose

Handles edge cases where:
- Webhook was missed or delayed
- Client verify failed and user didn't retry
- Any gap between Razorpay's state and your DB

### Implementation

```javascript
// functions/razorpay/reconcile.js (run via cron every 15-30 minutes)
import Razorpay from 'razorpay';

export default async function handler(req, res) {
  // 1. Find all orders with status = 'pending' older than 30 minutes
  const staleOrders = await fetchStaleOrders({ 
    status: 'pending',
    olderThanMinutes: 30,
    paymentProvider: 'rz_pg',
  });

  for (const order of staleOrders) {
    if (!order.razorpay_order_id) {
      // No Razorpay order was ever created — safe to mark as failed
      await updateOrder(order.order_id, { status: 'failed' });
      continue;
    }

    // 2. Ask Razorpay for the current status of this order
    const company = await fetchCompanyById(order.company_id);
    const razorpay = new Razorpay({
      key_id: company.razorpay_id,
      key_secret: company.razorpay_secret,
    });

    const rzOrder = await razorpay.orders.fetch(order.razorpay_order_id);

    if (rzOrder.status === 'paid') {
      // Payment was successful — find the payment ID
      const payments = await razorpay.orders.fetchPayments(order.razorpay_order_id);
      const capturedPayment = payments.items.find(p => p.status === 'captured');
      await updateOrder(order.order_id, {
        status: 'success',
        razorpay_payment_id: capturedPayment?.id ?? null,
      });
    } else if (rzOrder.status === 'attempted') {
      // Payments were attempted but none succeeded — check if all failed
      const payments = await razorpay.orders.fetchPayments(order.razorpay_order_id);
      const allFailed = payments.items.every(p => p.status === 'failed');
      if (allFailed && payments.items.length > 0) {
        await updateOrder(order.order_id, { status: 'failed' });
      }
      // else: still in progress, leave as pending
    } else if (rzOrder.status === 'created') {
      // No payment attempt was made — user abandoned
      // Mark as failed if it's been > 1 hour
      if (orderAgeMinutes(order) > 60) {
        await updateOrder(order.order_id, { status: 'failed' });
      }
    }
  }

  return res.json({ reconciled: staleOrders.length });
}
```

### Cron setup (Nhost)

In `nhost.toml` or via Nhost Dashboard → Functions → Cron:

```toml
[functions.razorpay-reconcile]
schedule = "*/15 * * * *"   # every 15 minutes
```

---

## 8. Environment Variables / Secrets

Add these to your Nhost project (Dashboard → Settings → Environment Variables):

| Variable | Where used | Description |
|----------|-----------|-------------|
| `RAZORPAY_WEBHOOK_SECRET` | Webhook handler | Secret from Razorpay Dashboard → Webhooks |

**Per-company secrets** (stored in DB, not env vars):

| Column | Table | Description |
|--------|-------|-------------|
| `razorpay_id` | `companies` | Razorpay Key ID (`rzp_live_xxxxx` or `rzp_test_xxxxx`) |
| `razorpay_secret` | `companies` | Razorpay Key Secret (never exposed to client) |

> **Important**: `razorpay_secret` is per-company and stored in the `companies` table. Do **not** put it in env vars if you support multiple companies with different Razorpay accounts.

---

## 9. Client ↔ Backend Flow Summary

```
Client                              Backend                          Razorpay
──────                              ───────                          ────────
1. createOrder(status:'pending')
   ────────────────────────────►  INSERT order_history
                                  (status = 'pending')
   ◄────────────────────────────  { server_order_id }

2. createRazorpayOrder(...)
   ────────────────────────────►  Razorpay.orders.create()  ──────►  Create order
                                                             ◄──────  { id: order_xxx }
                                  UPDATE order_history SET
                                    razorpay_order_id = order_xxx
   ◄────────────────────────────  { razorpay_order_id }

3. Open Razorpay SDK
   (user pays in SDK)             ·                          ◄─────  SDK callback
   SDK returns success ◄──────────────────────────────────────────

4. verifyRazorpayPayment(...)
   ────────────────────────────►  Verify HMAC signature
                                  If valid:
                                    UPDATE status = 'success'
                                    UPDATE razorpay_payment_id
   ◄────────────────────────────  { success: true, status: 'success' }

   Show ✓ → Navigate to receipt

5. (Async) Razorpay Webhook
                                  ◄────────────────────────────────  payment.captured
                                  If still pending:
                                    UPDATE status = 'success'
                                  Return 200

6. (Cron) Reconciliation
                                  Find pending orders > 30min
                                  Razorpay.orders.fetch()  ────────►  Get order status
                                                            ◄────────  { status: 'paid' }
                                  UPDATE status accordingly
```

---

## 10. Security Checklist

- [ ] `razorpay_secret` column has **no Hasura select permission** for any client role
- [ ] `razorpay_id` column is readable by authenticated users (needed for SDK initialization)
- [ ] Hasura Actions run as **admin** (to access `razorpay_secret`)
- [ ] Webhook handler validates `x-razorpay-signature` before processing
- [ ] Verification handler uses HMAC-SHA256 with the correct company's `key_secret`
- [ ] `updateOrderStatus` mutation only allows `pending → failed` or `pending → success` transitions
- [ ] No payment-related secrets are in client-side code or logs
- [ ] Webhook endpoint returns `200` even on duplicate events (idempotency)
- [ ] Reconciliation cron only modifies `pending` orders (never overwrites `success` or `failed`)

---

## Quick Reference: What to Create

| Item | Type | Priority |
|------|------|----------|
| `companies.razorpay_id` column | DB migration | **Required** |
| `companies.razorpay_secret` column | DB migration | **Required** |
| `order_history` new columns | DB migration | **Required** |
| `razorpay_id` in `COMPANIES_QUERY` | Frontend fix | **Required** |
| Hasura select permission for `razorpay_id` | Hasura config | **Required** |
| Hasura block permission for `razorpay_secret` | Hasura config | **Required** |
| `createRazorpayOrder` Action + handler | Hasura Action + Function | **Required** |
| `verifyRazorpayPayment` Action + handler | Hasura Action + Function | **Required** |
| `updateOrderStatus` permission | Hasura permission | **Required** |
| Razorpay webhook handler | Serverless function | **Highly recommended** |
| Reconciliation cron job | Serverless function + cron | **Highly recommended** |
| Status transition guard | DB trigger or Hasura check | Recommended |
