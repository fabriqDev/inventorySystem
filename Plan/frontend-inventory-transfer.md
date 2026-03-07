# Frontend Specification: Inventory Transfer

This document describes the frontend implementation of the Inventory Transfer feature for the FabriqWorld app.

---

## 1. Navigation and Entry Point

- **Entry**: From the **Inventory** screen (when the user taps the Inventory tile on the company screen), an **Inventory Transfer** tile appears at the **top** of the screen, above the product list.
- **Tile**: Same visual style as company tiles (icon, label “Inventory Transfer”, short description, chevron). Tapping navigates to the Inventory Transfer screen.
- **Route**: `/company/[id]/inventory-transfer` (file: `app/company/[id]/inventory-transfer.tsx`).

---

## 2. Inventory Transfer Screen Layout

The screen has **three tabs** in a horizontal tab bar at the top:

1. **Create Transfer** – Create a new outbound transfer.
2. **Requests** – Incoming pending transfers (accept/reject).
3. **History** – Past transfers (accepted, rejected, cancelled).

Tab content is rendered below the tab bar. Only one tab is active at a time.

---

## 3. Tab 1: Create New Transfer

### 3.1 Destination Company

- A **dropdown** (or tappable field) opens a **company picker**.
- The list shows all companies the user has access to **except** the current company (source).
- Filtering by “inventory transfer” role can be applied when the backend exposes it; until then, show all user companies except the current one.
- Selection is stored as `destinationCompanyId`. The selected company name is shown in the dropdown.

### 3.2 Adding Items

- **“Add item”** button opens a **modal** that reuses the same product list used elsewhere (e.g. `ProductSearchList` with search and optional scan_code flow).
- User selects a product; the product is added to the transfer line items with quantity **1**.
- If the product is already in the list, increment quantity by 1 (capped at available stock).
- Modal closes after selection.

### 3.3 Line Item Row

Each line shows:

- Product name and scan_code.
- **Max quantity** (available stock) for reference.
- **Quantity controls**: minus button, numeric input (keyboard editable), plus button.
- **Validation**: Minimum 1, maximum = available stock for that product. User cannot enter negative or above max.
- **Remove** (e.g. trash icon) to remove the line.

### 3.4 Initiate Transfer Button

- A sticky **“Initiate transfer”** button at the bottom is enabled only when:
  - A destination company is selected,
  - At least one item is in the list,
  - Every line has quantity between 1 and max.
- On tap: call `createTransfer` API with `source_company_id` (current company), `destination_company_id`, and items (article_code, quantity). On success, clear the form, optionally switch to the Requests tab and show success feedback.

---

## 4. Tab 2: Requests (Incoming)

- **Data**: Fetch **pending** transfers where `to_company_id` equals the current company (status `pending` or `in_transit`).
- **List**: Each card shows:
  - From company name.
  - Status badge (pending / in_transit).
  - Date and item count.
  - **Accept** and **Reject** buttons.
- **Accept**: Call `acceptTransfer(transferId)`. On success, **refetch** the product list for the current company and **refresh the local product cache** (e.g. `refreshProducts(companyId)`) so inventory counts update. Remove the transfer from the pending list.
- **Reject**: Call `rejectTransfer(transferId)`. On success, remove the transfer from the pending list.
- Loading and error states should be handled (e.g. disable buttons while request in flight, show error message on failure).

---

## 5. Tab 3: History

- **Data**: Fetch transfer **history** for the current company (transfers where the company is either source or destination and status is `accepted`, `rejected`, or `cancelled`).
- **List**: Each card shows:
  - Direction: “To: &lt;company&gt;” (outgoing) or “From: &lt;company&gt;” (incoming).
  - Status badge.
  - Date and item count.
- **Read-only**: No accept/reject or edit actions.

---

## 6. Models / Types (Frontend)

- **TransferStatus**: `'pending' | 'accepted' | 'rejected'`.
- **TransferItem**: article_code, quantity.
- **InventoryTransfer**: id, source_company_id, source_company_name, destination_company_id, destination_company_name, status, created_by_user_id, notes?, items[], created_at, updated_at.

Defined in `types/transfer.ts`. Create-transfer payload uses `CreateTransferInput` and `CreateTransferItemInput` from the backend types layer.

---

## 7. API Layer

- **File**: `lib/api/transfers.ts`.
- **Functions**:
  - `fetchPendingTransfers(companyId, useMock)` – for Requests tab.
  - `fetchTransferHistory(companyId, useMock)` – for History tab.
  - `createTransfer(input, useMock)` – for Create tab submit.
  - `acceptTransfer(transferId, useMock)` – for Accept in Requests.
  - `rejectTransfer(transferId, useMock)` – for Reject in Requests.
  - `fetchTransferableCompanies(companies, currentCompanyId)` – filters user’s companies to exclude current (used for destination dropdown).

All transfer API functions use the backend provider (NHost/Hasura); mock mode can return empty lists or stub success for development.

---

## 8. State Management

- **Create tab**: Local component state for destination company, line items (product + quantity), and modal visibility. No global context required.
- **Requests / History**: Local state for list data; refetch on tab focus (e.g. `useFocusEffect`) for Requests and History.
- **Product cache**: After a successful **Accept** on the Requests tab, call the app’s product cache refresh (e.g. `refreshProducts(companyId)`) so that inventory counts and any dependent UIs stay in sync.

---

## 9. UI Consistency

- Reuse existing themed components: `ThemedText`, `ThemedView`, `IconSymbol`, and the same card/list styling patterns used on the Create Order and Orders (Sales) screens.
- Reuse `ProductSearchList` for the “Add item” product picker modal.
- Tab bar: segment-style control (e.g. three labels with an underline or highlight for the active tab).
- Safe area insets applied to modals and bottom button so content is not hidden by notches or home indicators.

---

## 10. Implementation Checklist

- [ ] Inventory screen: Add Inventory Transfer tile at top; navigate to `/company/[id]/inventory-transfer`.
- [ ] Inventory Transfer screen: Three-tab layout (Create, Requests, History).
- [ ] Create tab: Destination dropdown, Add item modal (ProductSearchList), line items with +/- and keyboard input, min/max validation, Initiate transfer button.
- [ ] Requests tab: Fetch pending transfers, list with Accept/Reject, on accept refetch products and refresh cache.
- [ ] History tab: Fetch history, read-only list with direction and status.
- [ ] Types in `types/transfer.ts`; API in `lib/api/transfers.ts`; backend provider methods and GraphQL stubs in `lib/backend/types.ts` and `lib/backend/nhost.ts`.
- [ ] No edits to the plan file itself.
