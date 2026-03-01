---
name: Company POS Inventory Flow
overview: Implement company selection flow, tile dashboard; role + visible_tiles bundled in companies fetch (no extra call on tap), Current Inventory, Past Orders, and Create Order pages with Razorpay integration. Material Design-inspired UI. All IDs UUIDs; rzpay_key_id; slug optional.
todos: []
isProject: false
---

# Company POS + Inventory Flow Plan

## 1. Data Models (Types & Supabase Schema)

### Company (and CompanyWithRole)

```ts
// types/company.ts
type Role = 'super_admin' | 'admin' | 'employee';

interface Company {
  id: string;  // UUID
  name: string;
  slug?: string;  // Optional: URL-safe identifier e.g. "my-store" for human-friendly URLs
  rzpay_key_id: string | null;  // Razorpay public key; null = online payments disabled
  meta: {
    address?: string;
    logo_url?: string;
  };
  created_at: string;
  updated_at: string;
}

// Enriched company: includes user's role + visible_tiles (all from single fetch after login)
interface CompanyWithRole extends Company {
  role: Role;
  visible_tiles: TileId[];  // Server returns this per company; no extra call on tap
}
```

**Slug:** Optional URL-safe identifier (e.g. `my-store`). Use for friendly URLs; omit if you rely on UUIDs only.

**IDs:** All identifiers (company, order, product, user, etc.) are UUIDs throughout the system.

**Supabase:** Extend existing `companies` table: add `rzpay_key_id` (text, nullable). `meta` JSONB already exists.

### TileId

```ts
// types/tiles.ts
export type TileId = 'inventory' | 'past_orders' | 'create_order';
```

`role` and `visible_tiles` come bundled with each company in the companies fetch — no separate UserCompanyMeta API call when user taps a company.

### Order

```ts
// types/order.ts
interface Order {
  id: string;  // UUID
  company_id: string;  // UUID
  total_amount: number;  // paise
  currency: string;  // from backend, e.g. '₹'
  status: OrderStatus;
  payment_method: 'cash' | 'online';
  razorpay_order_id?: string | null;
  created_at: string;
}
```

### OrderItem (line item)

```ts
interface OrderItem {
  id: string;  // UUID
  order_id: string;  // UUID
  product_id: string;  // UUID
  quantity: number;
  unit_price: number;  // paise, snapshot at purchase
  currency: string;  // from backend
}
```

### Product

```ts
// types/product.ts
interface Product {
  id: string;  // UUID
  company_id: string;  // UUID
  name: string;
  sku: string;  // non-null
  barcode: string | null;
  price: number;  // paise
  currency: string;  // from backend, e.g. '₹'
  image_url?: string | null;
}
```

### Supabase Schema Additions (SQL)

```sql
-- Add to companies
alter table companies add column rzpay_key_id text;

-- Products: sku not null, currency for display (₹ default)
create table products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) not null,
  name text not null,
  sku text not null,
  barcode text,
  price int not null,  -- paise
  currency text not null default '₹',
  image_url text,
  created_at timestamptz default now()
);

-- Orders
create table orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) not null,
  total_amount int not null,  -- paise
  currency text not null default '₹',
  status text not null check (status in ('success','failed','pending')),
  payment_method text not null check (payment_method in ('cash','online')),
  razorpay_order_id text,
  created_at timestamptz default now()
);

-- Order items
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) not null,
  product_id uuid references products(id) not null,
  quantity int not null,
  unit_price int not null,  -- paise
  currency text not null default '₹'
);
```

---

## 2. Route Structure

```text
app/
  (tabs)/
    index.tsx          -> Companies list (current Home)
    company/
      [id].tsx         -> Company details (tiles)
      [id]/
        inventory.tsx  -> Current Inventory (placeholder text)
        orders.tsx     -> Past Orders (list + filter + total sales)
        create-order.tsx -> Create Order (Scan/Search + Collect Payment)
```

Use `router.push(\`/company/${id}\`)` from companies list. Company details page receives `selectedCompany` from context — it already has `role` and `visible_tiles` from the companies fetch. No extra API call on tap.

---

## 3. Auth Context Extension

Extend [contexts/auth-context.tsx](contexts/auth-context.tsx):

- Add `companies: CompanyWithRole[]`, `selectedCompany: CompanyWithRole | null`, `fetchCompanies()`, `setSelectedCompany()`
- **On login:** Single fetch that returns companies with `role` and `visible_tiles` for each. Source: `user_companies` (role) joined with `companies`; `visible_tiles` from `user_companies.meta` or a view/RPC that computes it per role. No separate call for UserCompanyMeta.
- Store `selectedCompany` so child screens access `role` and `visible_tiles` directly

---

## 4. Companies List (Home)

Replace [app/(tabs)/index.tsx](app/(tabs)/index.tsx) content:

- Use `useAuth()` → `companies`
- FlatList of company cells (Material card style: elevated, rounded)
- OnPress: `router.push(\`/company/${company.id})`and`setSelectedCompany(company)`
- Empty state: "No companies yet"

---

## 5. Company Details (Tiles)

[app/(tabs)/company/[id].tsx](app/(tabs)/company/[id].tsx):

- Get `selectedCompany` from context (set when user tapped the company) — already has `role` and `visible_tiles`
- Render Material-style tiles based on `selectedCompany.visible_tiles`:
  1. **Current Inventory** → `/(tabs)/company/[id]/inventory`
  2. **Past Orders** → `/(tabs)/company/[id]/orders`
  3. **Create Order** → `/(tabs)/company/[id]/create-order`
- Header: company name; back to companies list

---

## 6. Current Inventory

[app/(tabs)/company/[id]/inventory.tsx](app/(tabs)/company/[id]/inventory.tsx):

- Product list for company. See [product/product.plan.md](product/product.plan.md) for full spec: search (debounced), pagination (30–50/page).
- Material card layout

---

## 7. Past Orders

[app/(tabs)/company/[id]/orders.tsx](app/(tabs)/company/[id]/orders.tsx):

- Top: total sales value (sum of successful orders)
- Top-right: filter chip (Success / Failure / All)
- FlatList of order rows: order id, date, amount, status badge
- Fetch from Supabase: `orders` where `company_id = selectedCompany.id` ordered by `created_at desc`
- Filter client-side by `status`

---

## 8. Create Order (Cart + Checkout)

**Cart page:** [app/(tabs)/company/[id]/create-order.tsx](app/(tabs)/company/[id]/create-order.tsx) — See [cart/cart.plan.md](cart/cart.plan.md).

- **Top:** Scan and Search buttons
- **Cart:** List of items, total with currency, Checkout button
- **Checkout:** Navigates to [company/[id]/checkout](company/[id]/checkout) (Razorpay later)

**Checkout page:** [app/(tabs)/company/[id]/checkout.tsx](app/(tabs)/company/[id]/checkout.tsx) — Placeholder for now.

- **Later:** Cash | Online (Razorpay). **Cash:** Create order in DB with `payment_method: 'cash'`, `status: 'success'`. **Online:** Call backend API to create Razorpay order → open Razorpay SDK with `rzpay_key_id` from company.

### Razorpay Flow (Online) — Checkout page

1. User taps "Online"
2. POST to backend (or Supabase Edge Function) with `company_id`, `amount`, `items` → returns `{ razorpay_order_id }` (and your DB order id)
3. Open Razorpay Checkout with `rzpay_key_id` from company
4. On success: update order status to `success`; on failure: `failed`

**Razorpay SDK:** `react-native-razorpay` (or Razorpay Web Checkout for web). Company model includes `rzpay_key_id`.

---

## 9. Material Design UI

- Use **elevation** (shadow) and **rounded corners** for cards
- **Primary color** for actions; **surface** for cards
- **Typography:** titles bold, body regular
- Update [constants/theme.ts](constants/theme.ts) with Material-inspired tokens (primary, surface, elevation)
- Optional: add `react-native-paper` for ready-made Material components (Card, Button, Chip, etc.) — or build custom components matching MD3

---

## 10. JSON / Schema to Discuss


| Item                       | Status | Notes                                                                                      |
| -------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| `Company.rzpay_key_id`     | Add    | In company model; used for Razorpay SDK                                                    |
| Companies fetch response   | Add    | Must include `role` + `visible_tiles` per company (from user_companies.meta or view)        |
| Order creation API     | TBD         | Need endpoint for creating Razorpay order; Supabase Edge Function or external backend |
| `Order` / `OrderItem`  | Add         | Tables + types defined above                                                          |
| `Product`              | Add         | Table + type; barcode for scan                                                        |
| Cart (local state)     | Client-only | No DB until order is submitted                                                        |


---

## 11. File Summary


| Action  | Path                                                                          |
| ------- | ----------------------------------------------------------------------------- |
| Create  | `types/company.ts`, `types/order.ts`, `types/product.ts`, `types/tiles.ts`    |
| Modify  | `contexts/auth-context.tsx` (companies, fetch, selectedCompany)               |
| Modify  | `app/(tabs)/index.tsx` (companies list)                                       |
| Create  | `app/(tabs)/company/[id].tsx`                                                 |
| Create  | `app/(tabs)/company/[id]/inventory.tsx`                                       |
| Create  | `app/(tabs)/company/[id]/orders.tsx`                                          |
| Create  | `app/(tabs)/company/[id]/create-order.tsx` (Cart), `company/[id]/checkout.tsx` |
| Create  | `app/(tabs)/company/_layout.tsx` (Stack for nested routes)                    |
| Run SQL | Supabase (products, orders, order_items, companies.rzpay_key_id)              |
| Install | `react-native-razorpay` (or use web checkout for web), `expo-barcode-scanner` |
| Update  | `constants/theme.ts` (Material tokens)                                        |


---

## 12. Companies Fetch: Role + Visible Tiles (Single Call)

**Flow:** After login, one fetch returns all companies the user belongs to, each with `role` and `visible_tiles` already included.

**Data source options:**
- `user_companies` table: add `meta` JSONB column with `{ "visible_tiles": ["inventory","past_orders","create_order"] }` — server stores per-user-per-company
- Or: DB view/RPC that joins `user_companies` + `companies` and computes `visible_tiles` from role (e.g. config table mapping role → tiles)

**On company tap:** No extra API call. `selectedCompany` from context already has `visible_tiles`. Company details page renders tiles directly.
