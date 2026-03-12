# Navigation

FabriqWorld uses **Expo Router** for file-based routing.

## Route tree

- **Root stack** — Root layout wraps the app with providers and renders the appropriate stack.
- **(auth)** — Login and other unauthenticated screens. After login, user is sent to `/(tabs)`.
- **Stack.Protected** — Requires session; redirects to auth if not signed in.
- **(tabs)** — Tab navigator: **Home** (company list), **Explore** (placeholder).
- **company/[id]** — Company-scoped stack. Dynamic segment `[id]` is the company ID. Layout wraps this stack with `CartProvider`.

Flow: **Auth** → **(tabs)** or **company/[id]**. From Home, user selects a company and is pushed to `/company/{id}` (tiles). From there, routes include:

- `company/[id]` — Tiles (index)
- `company/[id]/inventory` — Inventory (product list with quantity)
- `company/[id]/orders` — Orders list with filters
- `company/[id]/create-order` — Create order (cart, add/return items)
- `company/[id]/checkout` — Checkout (payment choice, submit order)
- `company/[id]/receipt-preview` — Receipt after successful order (print, done)
- `company/[id]/inventory-transfer` — Inventory transfer (create, requests, history)

## Params and navigation

- **Reading params:** Use `useLocalSearchParams<{ id: string }>()` (or other param types) in the screen. The company `id` is available as `id` in company-scoped screens.
- **Navigation:**
  - `router.push('/company/abc-123/checkout')` — Push onto stack.
  - `router.replace(...)` — Replace current screen (e.g. after login; redirect from checkout when cart is empty).
  - `router.back()` — Go back.
  - `router.dismissTo('/company/abc-123')` — Dismiss back to company tiles (e.g. after receipt “Done” or after web checkout).

App route files are thin re-exports of feature screens; the screens use `useLocalSearchParams` and `useRouter` from `expo-router` as usual.

## Company layout and CartProvider

`app/company/[id]/_layout.tsx` wraps the company stack with `CartProvider`. Cart state (items, total, add/remove/update) is therefore scoped to the company flow and available via `useCart()` in create-order and checkout.

## See also

- [Architecture](architecture.md) — Routing and dependency injection
- [Features: Company](features/company.md) — Company screens and flow
