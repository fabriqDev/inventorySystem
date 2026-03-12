# Architecture

FabriqWorld uses **MVVM with a lightweight Clean** approach: two layers only — **Presentation** (View + ViewModel) and **Data**. There is no separate domain or use-case layer.

## Layers

```
┌─────────────────────────────────────────────────────────┐
│  Presentation                                           │
│  ┌─────────────┐    ┌─────────────────────────────────┐ │
│  │ View        │───▶│ ViewModel / Hook                │ │
│  │ (Screens,   │    │ (state, actions, calls API)     │ │
│  │  components)│◀───│                                 │ │
│  └─────────────┘    └──────────────┬──────────────────┘ │
└───────────────────────────────────┼─────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────┐
│  Data                                                    │
│  ┌─────────────────────┐  ┌──────────────────────────┐  │
│  │ API / Services      │  │ Backend abstraction      │  │
│  │ (core/api/,         │─▶│ (core/backend/ nhost)   │  │
│  │  core/services/)    │  │                          │  │
│  └─────────────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

- **View:** React screens and feature-specific UI components. Minimal logic; they bind to ViewModel state and callbacks. No use cases; Views/ViewModels talk directly to API and backend.
- **ViewModel:** Feature-scoped hooks (and shared context hooks) that hold UI state, call services/API, and expose state and actions to the View. Existing contexts (auth, cart, company, product-cache, data-source, theme) live in `core/context/` as shared state/services.
- **Data:** `core/backend/` (e.g. nhost.ts) and `core/api/` (companies, products, orders, transfers) plus `core/services/` (format, toast, printing). No intermediate use-case or domain layer.

## Core vs features

- **core/** — Shared code used by more than one feature: API, backend, context, hooks, services, strings, types, constants, shared UI components (themed-text, toast-host, icon-symbol, haptic-tab, product-search-list, add-return-item-modal, printer-select-modal).
- **features/** — Feature modules (auth, home, explore, company). Each can have `screens/`, `components/`, `hooks/`, `services/`, `types/`. Feature screens and ViewModels import from `@/core/...` and optionally `@/features/<other>/...`.

## Role of `app/`

The **`app/`** directory is the **Expo Router** route tree. Route files are **thin**: they only re-export the default component from the corresponding feature screen (e.g. `app/company/[id]/checkout.tsx` exports the default from `@/features/company/screens/CheckoutScreen`). Layouts in `app/` wrap the tree with providers from `core/context/` (and company layout with `CartProvider`). No business logic lives in `app/`; routing and provider wiring only.

## Routing and dependencies

### How routing works

- **Expo Router** is file-based. Segments: `app/(auth)/`, `app/(tabs)/`, `app/company/[id]/` define URLs. The dynamic segment `[id]` is the company ID.
- **Params:** Screens read params via `useLocalSearchParams<{ id: string }>()` (or similar). Navigation uses `router.push()`, `router.replace()`, `router.back()`, `router.dismissTo()`; params are encoded in the URL (e.g. `/company/abc-123/checkout`).
- **Layouts:** `app/_layout.tsx` wraps the app with providers; `app/company/[id]/_layout.tsx` wraps company scope with `CartProvider`. No explicit “dependency” object is passed; dependencies are provided via React Context (see below).

### How dependencies are passed

- **Primary: Context + hooks**  
  Providers in `app/_layout.tsx` supply auth, theme, data-source, company, product-cache (and `CartProvider` in company layout). Screens and ViewModels **consume** via hooks: `useAuth()`, `useCart()`, `useCompany()`, `useProductCache()`, `useDataSource()`, `useAppTheme()`, `useColorScheme()`. Dependencies (backend, API, toast) are used inside those contexts or inside feature code that imports from `core/` (e.g. `createOrder` from `core/api/orders`). The “injection” is the provider tree and module imports.

- **Optional: Constructor or props-based injection**  
  For testability, a ViewModel hook can accept an optional service argument (e.g. `useCheckout(orderService?)`). In production the hook uses the default from core; in tests the test passes a mock. Alternatively, the thin app route can pass `companyId` (and optionally a service) as props. Prefer URL params + hooks for route data and Context for global deps; use props only when it improves tests or clarity.

Feature screens and ViewModels get “dependencies” by calling these hooks and importing from `core/`.

## See also

- [Folder structure](folder-structure.md) — Layout of `app/`, `core/`, `features/`, and other folders
- [Navigation](navigation.md) — Route tree, Stack.Protected, company layout
- [Error handling](error-handling.md) — BackendError, toasts, screen errors
- [Local storage](local-storage.md) — Session, printer storage
- [Strings and localization](strings-and-localization.md) — core/strings, i18n
- [Features: Auth](features/auth.md), [Home](features/home.md), [Explore](features/explore.md), [Company](features/company.md)
