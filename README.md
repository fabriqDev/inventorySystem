# FabriqWorld

Inventory management and POS application built with **Expo (React Native)**. Supports iOS, Android, and Web. Uses **NHost (Hasura GraphQL + Auth)** for backend; payments via **Razorpay** (when configured).

## Tech stack

- **Expo SDK 54**, React Native, **Expo Router** (file-based routing)
- **NHost** (Hasura GraphQL + Auth)
- **State:** React Context (Auth, Cart, Company, DataSource, Theme, ProductCache)
- **Payments:** Razorpay (when `razorpay_id` is set on company)

## Architecture

The app follows **MVVM with a lightweight Clean** structure: **Presentation** (View + ViewModel) and **Data** only. No separate domain/use-case layer.

- **View:** React screens and feature UI components. Minimal logic; bind to ViewModel state and callbacks.
- **ViewModel:** Feature-scoped hooks (and shared context hooks) that hold UI state, call services/API, and expose state and actions to the View.
- **Data:** `core/backend/` and `core/api/` form the data layer.

See [docs/architecture.md](docs/architecture.md) for the full diagram, routing, and how dependencies are passed (Context + hooks).

## Folder structure

- **`app/`** — Expo Router route tree only. Route files are thin wrappers that re-export screens from `features/`.
- **`core/`** — Shared layer: `api/`, `backend/`, `constants/`, `context/`, `hooks/`, `services/`, `strings/`, `types/`, `components/`.
- **`features/`** — Feature modules: `auth/`, `home/`, `explore/`, `company/`. Each may have `screens/`, `components/`, `hooks/`, `services/`, `types/`.

## Navigation

- **Expo Router** defines the route tree: `(auth)` (login), `(tabs)` (Home, Explore), `company/[id]/*` (tiles, inventory, orders, create-order, checkout, receipt-preview, inventory-transfer).
- Auth-protected stack; company scope has its own layout and `CartProvider`.
- Params (e.g. company `id`) are read via `useLocalSearchParams()`; navigation uses `router.push()`, `router.replace()`, `router.dismissTo()`.

Details: [docs/navigation.md](docs/navigation.md) and [docs/architecture.md](docs/architecture.md#routing-and-dependencies).

## Error handling

- **BackendError** and helpers (`toBackendError`, `toUserMessage`) in `core/backend/errors.ts`.
- **gqlRequest** (nhost) shows a toast and rethrows; screens (e.g. checkout) may set local error state and show inline messages.
- When to use inline vs toast is described in [docs/error-handling.md](docs/error-handling.md).

## Local storage

- **Session:** AsyncStorage via NHost auth (native).
- **Printer device:** AsyncStorage in `core/services/printing/print-service.ts`.

See [docs/local-storage.md](docs/local-storage.md).

## Strings and localization

All user-facing UI strings live in **`core/strings.ts`** so that i18n can be added later without hunting through components. No hardcoded user-facing copy in screens or toasts. See [docs/strings-and-localization.md](docs/strings-and-localization.md).

## Features

- **[Auth](docs/features/auth.md)** — Login, session, sign-out.
- **[Home](docs/features/home.md)** — Company list, menu (theme, mock/live data, logout).
- **[Explore](docs/features/explore.md)** — Placeholder “Coming soon”.
- **[Company](docs/features/company.md)** — Company-scoped tiles, inventory, orders, create order, checkout, receipt preview, inventory transfer; cart and printing.

## Getting started

### Prerequisites

- Node.js 18+
- An [NHost](https://nhost.io) project with Hasura configured (for live data)

### Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in the project root:

   ```
   EXPO_PUBLIC_NHOST_SUBDOMAIN=your-nhost-subdomain
   EXPO_PUBLIC_NHOST_REGION=your-nhost-region
   ```

3. Start the development server (from the **project root**, not from inside `android/` or `ios/`):

   ```bash
   npx expo start
   ```

   If you see `ConfigError: The expected package.json path: .../android/package.json does not exist`, you are either running the command from inside the `android/` folder or passed `android` as a path. Run `npx expo start` from the project root with no path argument. Use `npx expo start --android` to open on a connected Android device.

4. Open on device (Expo Go), simulator, or press `w` for web. For native modules (e.g. Bluetooth printing), use a development build; see [docs/RUN_ON_DEVICE.md](docs/RUN_ON_DEVICE.md).

## Build and deploy

- **EAS:** Use EAS Build for cloud builds (APK, etc.).
- **Local APK:** See [docs/BUILD_APK.md](docs/BUILD_APK.md).
- **Run on device:** See [docs/RUN_ON_DEVICE.md](docs/RUN_ON_DEVICE.md).

---

## Documentation

- [Architecture](docs/architecture.md) — MVVM + Clean, routing, dependency injection
- [Navigation](docs/navigation.md) — Route tree, Stack.Protected, company layout
- [Error handling](docs/error-handling.md) — BackendError, toasts, screen-level errors
- [Local storage](docs/local-storage.md) — Session, printer storage
- [Strings and localization](docs/strings-and-localization.md) — `core/strings`, i18n readiness
- [Features: Auth](docs/features/auth.md)
- [Features: Home](docs/features/home.md)
- [Features: Explore](docs/features/explore.md)
- [Features: Company](docs/features/company.md)
- [Build APK](docs/BUILD_APK.md)
- [Run on device](docs/RUN_ON_DEVICE.md)
