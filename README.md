# FabriqWorld

Inventory management and POS application built with Expo (React Native). Supports iOS, Android, and Web.

## Tech Stack

- **Frontend:** Expo SDK 54, React Native, Expo Router (file-based routing)
- **Backend:** [NHost](https://nhost.io) (Hasura GraphQL + Auth)
- **State:** React Context (Auth, Cart, Company, DataSource, Theme)
- **Payments:** Razorpay (planned)

## Architecture

The app uses a **backend abstraction layer** (`lib/backend/`) so the backend provider can be swapped without changing application code:

```
lib/backend/
  types.ts    - AuthProvider, DataProvider, BackendProvider interfaces
  nhost.ts    - NHost implementation
  index.ts    - Single export point (swap provider here)
```

A **mock data toggle** in the hamburger menu lets you switch between live NHost data and local mock data at runtime.

## Project Structure

```
app/
  (auth)/           - Login screens
  (tabs)/           - Main tab navigation (Home, Explore)
  company/[id]/     - Company screens (Tiles, Inventory, Orders, Create Order, Checkout)
components/         - Reusable UI components
contexts/           - React contexts (Auth, Cart, Company, DataSource, Theme)
hooks/              - Custom hooks (color scheme, debounce)
lib/
  api/              - API layer (companies, products, orders) with mock/live toggle
  backend/          - Backend abstraction (NHost adapter)
  mock-data.ts      - Mock data for development
  format.ts         - Price, date, ID formatting utilities
types/              - TypeScript interfaces (Company, Product, Order, Cart, Tiles)
constants/          - Theme and currency constants
```

## Getting Started

### Prerequisites

- Node.js 18+
- An [NHost](https://nhost.io) project with Hasura configured

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

3. Start the development server:

   ```bash
   npx expo start
   ```

4. Open on your device (Expo Go), simulator, or press `w` for web.

## Database Schema (Hasura)

The app expects these tables:

| Table | Key Columns |
|-------|-------------|
| `companies` | id, name, slug, rzpay_key_id, meta, created_at, updated_at |
| `user_companies` | user_id, company_id, role, meta |
| `products` | id, company_id, name, sku, barcode, price, currency, quantity, image_url |
| `orders` | id, company_id, total_amount, currency, status, payment_method, razorpay_order_id, razorpay_payment_id |
| `order_items` | id, order_id, product_id, quantity, unit_price, currency |

All IDs are UUIDs. Prices are stored in paise (smallest currency unit).

## Deployment

Deployed on [Vercel](https://vercel.com). On push to `main`, Vercel auto-builds and deploys.

- **Build command:** `npx expo export -p web`
- **Output directory:** `dist`

Set `EXPO_PUBLIC_NHOST_SUBDOMAIN` and `EXPO_PUBLIC_NHOST_REGION` as environment variables in Vercel.

## Swapping the Backend

To replace NHost with another provider:

1. Create a new file in `lib/backend/` implementing `BackendProvider` from `types.ts`
2. Update `lib/backend/index.ts` to export the new provider
3. No other code changes needed
