# Folder structure

This document gives an overview of how the FabriqWorld codebase is organized. Use it to find where screens, APIs, shared UI, and config live.

## High-level layout

```
FabriqWorld/
├── app/              # Expo Router routes (thin re-exports → feature screens)
├── core/             # Shared code: API, backend, context, hooks, services, types, UI
├── features/         # Feature modules: auth, home, explore, company (screens + components)
├── plugins/          # Expo config plugins (if any)
├── assets/           # Images, mock data
├── public/           # Web: manifest, service worker
└── docs/             # Project documentation
```

- **`app/`** — Routing only. Each route file re-exports the screen from `features/`.
- **`core/`** — Everything shared across features (API, backend, context, hooks, services, strings, types, shared components).
- **`features/`** — One folder per feature; each holds screens, components, and optional hooks/services/types.

---

## `app/` — Routes (Expo Router)

File-based routing. Route files are thin: they only re-export the default from the matching feature screen.

```
app/
├── _layout.tsx           # Root layout, providers (auth, theme, data-source, etc.)
├── +html.tsx             # Web HTML shell
├── (auth)/               # Auth group (login flow)
│   ├── _layout.tsx
│   ├── index.tsx
│   └── login.tsx
├── (tabs)/               # Main tabs (home, explore)
│   ├── _layout.tsx
│   ├── index.tsx         # Home tab
│   └── explore.tsx       # Explore tab
└── company/
    ├── _layout.tsx       # Company shell
    └── [id]/             # Dynamic company ID
        ├── _layout.tsx   # CartProvider for company scope
        ├── index.tsx     # Tiles (company hub)
        ├── inventory.tsx
        ├── orders.tsx
        ├── create-order.tsx
        ├── checkout.tsx
        ├── receipt-preview.tsx
        └── inventory-transfer.tsx
```

- **`(auth)`** and **`(tabs)`** are route groups (parentheses don’t appear in the URL).
- **`[id]`** is a dynamic segment (company ID). URLs look like `/company/abc-123/orders`.

---

## `core/` — Shared code

Used by multiple features. Contains API layer, backend, context, hooks, services, strings, types, and shared UI.

```
core/
├── api/                  # Data access (calls backend)
│   ├── companies.ts
│   ├── orders.ts
│   ├── products.ts
│   └── transfers.ts
├── backend/              # Backend abstraction (e.g. NHost)
│   ├── errors.ts
│   ├── index.ts
│   ├── nhost.ts
│   └── types.ts
├── components/           # Shared UI components
│   ├── add-return-item-modal.tsx
│   ├── haptic-tab.tsx
│   ├── printer-select-modal.tsx
│   ├── product-search-list.tsx
│   ├── themed-text.tsx
│   ├── themed-view.tsx
│   ├── toast-host.tsx
│   └── ui/
│       ├── icon-symbol.tsx
│       └── icon-symbol.ios.tsx
├── constants/
│   ├── currency.ts
│   └── theme.ts
├── context/              # React Context providers (auth, cart, company, theme, etc.)
│   ├── auth-context.tsx
│   ├── cart-context.tsx
│   ├── company-context.tsx
│   ├── data-source-context.tsx
│   ├── product-cache-context.tsx
│   └── theme-context.tsx
├── hooks/
│   ├── use-color-scheme.ts
│   ├── use-color-scheme.web.ts
│   └── use-theme-color.ts
├── services/
│   ├── device.ts
│   ├── format.ts
│   ├── mock-data.ts
│   ├── toast.ts
│   └── printing/
│       ├── index.ts
│       ├── print-service.ts        # Bluetooth printing
│       └── receipt-builder.ts
├── strings.ts            # Centralized UI strings (i18n-ready)
└── types/
    ├── index.ts
    ├── cart.ts
    ├── company.ts
    ├── order.ts
    ├── product.ts
    ├── profile.ts
    ├── tiles.ts
    └── transfer.ts
```

- **`api/`** — Functions that talk to the backend (companies, orders, products, transfers).
- **`backend/`** — NHost/client setup and shared backend types.
- **`context/`** — Global state and dependency injection (auth, cart, company, data source, product cache, theme).
- **`services/`** — Formatting, toast, printing (Bluetooth), mock data.
- **`strings.ts`** — Single place for user-facing text; swap this for i18n later.
- **`types/`** — Shared TypeScript types.

---

## `features/` — Feature modules

One folder per feature. Each can have `screens/`, `components/`, `hooks/`, `services/`, and `types/` as needed.

```
features/
├── auth/
│   ├── screens/
│   │   └── LoginScreen.tsx
│   ├── components/       # (optional)
│   ├── hooks/            # (optional)
│   └── types/            # (optional)
├── home/
│   ├── screens/
│   │   └── HomeScreen.tsx
│   └── components/
│       └── CompanyCard.tsx
├── explore/
│   └── screens/
│       └── ExploreScreen.tsx
└── company/
    ├── screens/
    │   ├── TilesScreen.tsx
    │   ├── InventoryScreen.tsx
    │   ├── OrdersScreen.tsx
    │   ├── CreateOrderScreen.tsx
    │   ├── CheckoutScreen.tsx
    │   ├── ReceiptPreviewScreen.tsx
    │   └── InventoryTransferScreen.tsx
    ├── components/       # (optional)
    ├── hooks/            # (optional)
    ├── services/         # (optional)
    └── types/            # (optional)
```

- **Screens** — Full-page UI; they use `core` (API, context, hooks, types) and optional feature-specific hooks/components.
- **Components** — UI used only inside that feature (e.g. `CompanyCard` in home).
- **hooks/**, **services/**, **types/** — Use when a feature needs its own state logic, helpers, or types that aren’t shared elsewhere.

---

## Other root folders

| Folder      | Purpose |
|------------|---------|
| **`plugins/`** | Expo config plugins (e.g. for native build customisation). |
| **`assets/`**  | Static assets: `images/` (icons, splash), `mock/` (e.g. `companies.json`, `orders.json`, `products.json` for mock data). |
| **`public/`**  | Web-only: `manifest.json`, `sw.js` (service worker). |
| **`docs/`**    | Documentation: architecture, navigation, features, build, etc. |

---

## Import paths

- Use **`@/core/...`** for shared code:  
  `@/core/api/orders`, `@/core/context/cart-context`, `@/core/strings`, `@/core/types/order`, etc.
- Use **`@/features/...`** when a screen or component in one feature uses another feature:  
  `@/features/company/screens/CheckoutScreen`, `@/features/home/components/CompanyCard`.
- **`app/`** route files only import from `@/features/...` to re-export the screen; they do not hold business logic.

---

## See also

- [Architecture](architecture.md) — MVVM, core vs features, how routing and dependencies work
- [Navigation](navigation.md) — Route tree and navigation patterns
- [Features](features/) — Auth, Home, Explore, Company (purpose, screens, flows)
