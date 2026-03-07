# Backend Specification: Inventory Transfer

This document describes the backend implementation required for the Inventory Transfer feature. The frontend (NHost/Hasura) is already wired to call the APIs described here.

---

## 1. Overview

- **Flow**: Two-step flow. A user in the **source** company creates a transfer; a user in the **destination** company accepts or rejects it.
- **Transient state**: When a transfer is created, stock is deducted at the source (or reserved). When the destination accepts, stock is added at the destination. When the destination rejects, stock is returned to the source.
- **Permissions**: Only users with the appropriate role (e.g. admin + inventory transfer) in **both** source and destination companies should be allowed to create transfers. Only users with that role in the destination company should accept/reject.

---

## 2. Database Schema

### 2.1 Enum: `transfer_status`

```sql
CREATE TYPE transfer_status AS ENUM (
  'pending',    -- Created, not yet processed
  'in_transit', -- Stock deducted at source (optional; can go pending -> accepted/rejected)
  'accepted',   -- Destination accepted; stock added at destination
  'rejected',   -- Destination rejected; stock returned to source
  'cancelled'   -- Source cancelled before accept/reject
);
```

### 2.2 Table: `inventory_transfers`

| Column               | Type         | Notes |
|----------------------|--------------|--------|
| id                   | uuid         | PK, default gen_random_uuid() |
| from_company_id      | uuid         | FK to companies, NOT NULL |
| to_company_id       | uuid         | FK to companies, NOT NULL |
| status               | transfer_status | NOT NULL, default 'pending' |
| created_by_user_id   | uuid         | FK to auth.users, NOT NULL |
| responded_by_user_id | uuid         | FK to auth.users, nullable (set on accept/reject) |
| notes                | text         | Optional |
| created_at           | timestamptz  | default now() |
| updated_at           | timestamptz  | default now(), updated on status change |

- Add unique constraint if needed; ensure FKs and indexes for `from_company_id`, `to_company_id`, `status` for list queries.

### 2.3 Table: `inventory_transfer_items`

| Column        | Type    | Notes |
|---------------|---------|--------|
| id            | uuid    | PK, default gen_random_uuid() |
| transfer_id   | uuid    | FK to inventory_transfers ON DELETE CASCADE, NOT NULL |
| product_id    | uuid    | FK to products, NOT NULL |
| size_id       | uuid    | FK to product_sizes, nullable (if product has sizes) |
| product_name  | text    | Denormalized for history |
| size          | text    | Denormalized (e.g. "M", "L") |
| quantity      | int     | NOT NULL, > 0 |
| scan_code     | text    | Optional (legacy); prefer article_code |

- Index on `transfer_id` for fetching items by transfer.

---

## 3. State Transitions

1. **Create transfer**  
   - Insert `inventory_transfers` (status `pending` or `in_transit`) and `inventory_transfer_items`.  
   - **When to deduct at source**: Either at create (then status `in_transit`) or when destination accepts. Recommended: deduct at create (status `in_transit`) so available stock reflects “in transfer” and destination accept just adds at destination.

2. **Accept (destination)**  
   - Update transfer status to `accepted`, set `responded_by_user_id`, `updated_at`.  
   - Add stock to destination company for each item (product/size and quantity).  
   - If stock was not deducted at create, deduct at source now; otherwise no source change.

3. **Reject (destination)**  
   - Update transfer status to `rejected`, set `responded_by_user_id`, `updated_at`.  
   - If stock was deducted at create, return stock to source (add back).  
   - No change at destination.

4. **Cancel (source)**  
   - Update transfer status to `cancelled`.  
   - If stock was deducted at create, return stock to source.

---

## 4. Stock Logic (Recommendation)

- **On create**: Decrement source inventory (e.g. `product_sizes.stock`) by each item’s quantity. Set transfer status to `in_transit`. Enforce available stock >= quantity; otherwise fail create.
- **On accept**: Increment destination inventory by each item’s quantity (create or update product_sizes/stock for the destination company as per your product model).
- **On reject/cancel**: Increment source inventory back by each item’s quantity.

All of the above should run in a transaction so that partial updates do not leave data inconsistent.

---

## 5. GraphQL API (Hasura)

The frontend expects the following. Adjust table/column names to match your actual schema (e.g. company name might come from a relation).

### 5.1 Queries

**Get pending transfers (for destination company – Requests tab)**

- **Operation**: `GetPendingTransfers(companyId: uuid!)`
- **Returns**: Transfers where `destination_company_id = companyId` and `status = 'pending'`, ordered by `created_at desc`.
- **Fields**: id, source_company_id, destination_company_id, status, created_by_user_id, notes, created_at, updated_at, and relations for `source_company` (company_name), `destination_company` (company_name), and items (inventory_transfer_items: article_code, quantity).

**Get transfer history (for a company – History tab)**

- **Operation**: `GetTransferHistory(companyId: uuid!)`
- **Returns**: Transfers where `from_company_id = companyId OR to_company_id = companyId`, and `status in ['accepted', 'rejected', 'cancelled']`, ordered by `created_at desc`.
- **Fields**: Same as above.

### 5.2 Mutations

**Create transfer**

- **Operation**: `CreateTransfer(from_company_id, to_company_id, items[], notes?)`
- **Effect**: Insert one row into `inventory_transfers` and related rows into `inventory_transfer_items`. Deduct stock at source (if using in_transit model). Return `{ id, status }`.

**Accept transfer**

- **Operation**: `AcceptTransfer(transferId: uuid!)`
- **Effect**: Update transfer status to `accepted`, set `responded_by_user_id` (from JWT), `updated_at`. Add stock to destination. Return the updated transfer (or at least id, status, updated_at).

**Reject transfer**

- **Operation**: `RejectTransfer(transferId: uuid!)`
- **Effect**: Update transfer status to `rejected`, set `responded_by_user_id`, `updated_at`. Return stock to source if it was deducted at create. Return the updated transfer (or id, status, updated_at).

---

## 6. Permissions / Roles

- **Create transfer**: User must be allowed to act on behalf of `from_company_id` and have permission to transfer to `to_company_id` (e.g. admin + “inventory transfer” role in both companies). Validate in a Hasura action or backend service.
- **Accept/Reject**: User must have permission for the destination company (e.g. admin + inventory transfer role for `to_company_id`). Validate in action/service.
- **Row-level**: Hasura select/update permissions should restrict transfers so that:
  - Source users see transfers where they are from_company.
  - Destination users see transfers where they are to_company (and can update only when status is pending/in_transit).

Expose “inventory transfer” (or equivalent) in your `access_role` / `visible_tiles` so the app can show the feature only to allowed users.

---

## 7. Frontend Contract (Summary)

- **Types**: Transfer status enum: `pending | accepted | rejected`. Transfer has: id, source_company_id, destination_company_id, source_company_name, destination_company_name, status, created_by_user_id, notes, items[], created_at, updated_at. Each item: article_code, quantity.
- **Create payload**: source_company_id, destination_company_id, items: [{ article_code, quantity }], notes?.
- **Errors**: Return clear GraphQL errors so the app can show “Create transfer failed”, “Accept failed”, etc.

---

## 8. Checklist for Backend Developer

- [ ] Create enum `transfer_status` and tables `inventory_transfers`, `inventory_transfer_items`.
- [ ] Implement create transfer (insert + deduct source stock in transaction).
- [ ] Implement accept (update status + add destination stock in transaction).
- [ ] Implement reject (update status + return source stock if needed).
- [ ] Expose GraphQL queries and mutations matching the names and shapes above (or document any naming differences for the frontend).
- [ ] Add Hasura permissions and role checks (admin + inventory transfer in both companies for create; in destination for accept/reject).
- [ ] Ensure `from_company` and `to_company` relations return at least `id` and a display name (e.g. `company_name` or `name`) for the UI.
