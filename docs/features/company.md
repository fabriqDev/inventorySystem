# Feature: Company

## Purpose

Company-scoped operations: view **tiles** (shortcuts), **inventory**, **orders**, **create order**, **checkout**, **receipt preview**, and **inventory transfer**. Cart is scoped to the company layout; product cache and company context are used across these screens.

## Sub-screens

| Route / Screen        | Description |
|----------------------|-------------|
| **Tiles** (`company/[id]`) | Grid of tiles: Inventory, Sales, Create Order, Transfer, Add Products. Tap to navigate to the corresponding screen. |
| **Inventory**        | Product list with search and quantity (ProductSearchList). |
| **Orders**           | Order list with filters (All, Success, Failed, Pending); total orders summary. |
| **Create Order**     | Cart; Add item / Return item (modal with ProductSearchList); checkout button. |
| **Checkout**         | Review items, total, stock warnings; Collect Payment (cash/online); submit order; redirect to receipt (native) or dismiss (web). |
| **Receipt Preview**  | Receipt content; Print (if printer connected); Done → dismiss to company tiles. |
| **Inventory Transfer** | Tabs: Create Transfer (destination, add items, initiate); Requests (pending accept/reject/cancel); History. |

## Screen flow

- From **Home**, user taps a company → `router.push(/company/{id})` (tiles).
- From **Tiles**, user taps a tile → e.g. `router.push(/company/{id}/create-order)`.
- **Create Order** → Checkout → (on success) **Receipt Preview** (native) or dismiss (web).
- **Receipt Preview** → Done → `router.dismissTo(/company/{id})`.
- **Inventory Transfer** — Create transfer: pick destination, add items, initiate; then see request in Requests. Incoming requests can be accepted or rejected; outgoing can be cancelled.

## State

- **Cart** — `useCart()` (CartProvider in company layout). Items, add/remove/update quantity, total, clear (after order).
- **Product cache** — `useProductCache()` for cached products and refresh (used in create-order, checkout, inventory).
- **Company** — `useCompany()` for `selectedCompany` (e.g. name, visible_tiles, razorpay_id).
- **DataSource** — `useDataSource()` for mock/live toggle (orders, transfers, companies, products).

## API

- **Products** — `core/api/products` (fetchProducts, etc.); used by ProductSearchList and product cache.
- **Orders** — `core/api/orders` (fetchOrders, createOrder); used in orders screen and checkout.
- **Transfers** — `core/api/transfers` (createTransfer, fetchPendingTransfers, fetchTransferHistory, acceptTransfer, rejectTransfer, cancelTransfer, fetchTransferableCompanies); used in inventory-transfer screen.
- **Companies** — `core/api/companies` (fetchCompanies, fetchTransferableCompanies for transfer destination list).

## Printing

- **Receipt** — Receipt text is built in `core/services/printing/receipt-builder.ts`. Checkout passes order data to Receipt Preview; Receipt Preview can print via `core/services/printing/print-service` (connectAndPrint, getSavedPrinter).
- **Printer selection** — PrinterSelectModal (from `core/components/printer-select-modal`) allows user to select and save a Bluetooth printer; saved device is stored in AsyncStorage (see [Local storage](../local-storage.md)).

## Local storage

- **Printer** — Last selected printer device is stored in AsyncStorage by `core/services/printing/print-service.ts`. Used on Receipt Preview and in printer selection flow.

## See also

- [Architecture](../architecture.md) — Data layer and context
- [Navigation](../navigation.md) — Company layout and CartProvider
- [Error handling](../error-handling.md) — Checkout and order errors
- [Local storage](../local-storage.md) — Printer storage
