# Frontend API Reference

## GraphQL Queries & Mutations with Expected Responses

---

## 1. Fetch Companies

**Query:**
```graphql
query GetCompanies($userId: uuid!) {
  user_company_roles(where: { user_id: { _eq: $userId } }) {
    role_type
  }
  assigned_companies: user_company_roles(where: { user_id: { _eq: $userId } }) {
    company {
      id
      name: company_name
      slug: company_code
      address
      created_at
      updated_at
    }
    access_role {
      role_type
      visible_tiles
    }
  }
  all_companies: companies {
    id
    name: company_name
    slug: company_code
    address
    created_at
    updated_at
  }
}
```

**Logic:**
- If user has `super_admin` or `sub_admin` role → use `all_companies`
- Otherwise → use `assigned_companies`

**Response:**
```json
{
  "user_company_roles": [{ "role_type": "company_admin" }],
  "assigned_companies": [{
    "company": { "id": "uuid", "name": "Delhi Public School", "slug": "DPS-DEL", "address": "..." },
    "access_role": { "role_type": "company_admin", "visible_tiles": ["inventory", "new_sale", "sale_history", "inventory_transfer"] }
  }],
  "all_companies": [...]
}
```

---

## 2. Fetch Products (Inventory)

**Query:**
```graphql
query GetProducts($companyId: uuid!) {
  product_inventory(
    where: { company_id: { _eq: $companyId } }
    order_by: { product: { name: asc } }
  ) {
    article_code
    size
    stock
    selling_price
    discount_percentage
    tax_percentage
    pending_transfer_items_aggregate(
      where: {
        transfer: {
          source_company_id: { _eq: $companyId }
          status: { _eq: "pending" }
        }
      }
    ) {
      aggregate { sum { quantity } }
    }
    product {
      id
      name
      description
      color
      uniform_type
      year
    }
  }
}
```

**Response:**
```json
{
  "product_inventory": [{
    "article_code": "TSH-HS-20",
    "size": "20",
    "stock": 100,
    "selling_price": 450,
    "discount_percentage": 10,
    "tax_percentage": 5,
    "pending_transfer_items_aggregate": {
      "aggregate": { "sum": { "quantity": 10 } }
    },
    "product": {
      "id": "uuid",
      "name": "Half Sleeve T-Shirt",
      "description": "White cotton T-shirt",
      "color": "White",
      "uniform_type": "summer",
      "year": null
    }
  }]
}
```

**Available Stock Calculation:**
```
reserved = pending_transfer_items_aggregate.aggregate.sum.quantity || 0
available = stock - reserved
```

---

## 3. Fetch Product by Barcode

**Query:**
```graphql
query GetProductByBarcode($companyId: uuid!, $barcode: String!) {
  product_inventory(
    where: { article_code: { _eq: $barcode }, company_id: { _eq: $companyId } }
    limit: 1
  ) {
    article_code
    size
    stock
    selling_price
    discount_percentage
    tax_percentage
    pending_transfer_items_aggregate(
      where: {
        transfer: {
          source_company_id: { _eq: $companyId }
          status: { _eq: "pending" }
        }
      }
    ) {
      aggregate { sum { quantity } }
    }
    product { id name description color year }
  }
}
```

**Response:** Same structure as above, single item array.

---

## 4. Create Sale

### Step 1: Create Order
```graphql
mutation CreateSale($order: order_history_insert_input!) {
  insert_order_history_one(object: $order) {
    order_id
    total
  }
}
```

**Variables:**
```json
{
  "order": {
    "company_id": "uuid",
    "user_id": "uuid",
    "transaction_type": "sale",
    "subtotal": 1000,
    "total": 1050,
    "payment_method": "cash",
    "status": "success"
  }
}
```

**Response:**
```json
{ "insert_order_history_one": { "order_id": "uuid", "total": 1050 } }
```

### Step 2: Create Order Items
```graphql
mutation CreateSaleItems($items: [order_items_insert_input!]!) {
  insert_order_items(objects: $items) {
    affected_rows
  }
}
```

**Variables:**
```json
{
  "items": [{
    "order_id": "uuid (from step 1)",
    "product_id": "TSH-HS-20",
    "product_name": "Half Sleeve T-Shirt",
    "quantity": 2,
    "unit_price": 450,
    "tax_percentage": 5,
    "tax_amount": 45,
    "total": 945
  }]
}
```

**Response:**
```json
{ "insert_order_items": { "affected_rows": 1 } }
```

**Possible Errors:**
```
[404] RESOURCE_NOT_FOUND: Product TSH-HS-20 not found
[422] VALIDATION_ERROR: Insufficient stock for TSH-HS-20 - Total: 100, Reserved: 10, Available: 90, Requested: 95
```

**Note:** `unit_price` must be >= 0. `quantity` must be > 0. Stock is auto-deducted by trigger.

---

## 5. Create Refund

### Step 1: Create Refund Order
```graphql
mutation CreateRefund($order: order_history_insert_input!) {
  insert_order_history_one(object: $order) {
    order_id
    total
  }
}
```

**Variables:**
```json
{
  "order": {
    "company_id": "uuid",
    "user_id": "uuid",
    "transaction_type": "refund",
    "original_order_id": "uuid (original sale order)",
    "subtotal": -450,
    "total": -472.5,
    "payment_method": "cash",
    "status": "success"
  }
}
```

### Step 2: Create Refund Items
```json
{
  "items": [{
    "order_id": "uuid (refund order from step 1)",
    "product_id": "TSH-HS-20",
    "product_name": "Half Sleeve T-Shirt",
    "quantity": 1,
    "unit_price": 450,
    "tax_percentage": 5,
    "tax_amount": 22.5,
    "total": -472.5
  }]
}
```

**Note:** `unit_price` stays positive. `total` is negative. Stock is auto-restored by trigger.

---

## 6. Fetch Orders (Sale History)

**Query:**
```graphql
query GetOrders($companyId: uuid!) {
  order_history(
    where: {
      company_id: { _eq: $companyId }
      order_items: { order_id: { _is_null: false } }
    }
    order_by: { created_at: desc }
  ) {
    order_id
    company_id
    total
    payment_method
    transaction_type
    created_at
    order_items {
      product_name
      quantity
      unit_price
      total
    }
  }
}
```

**Response:**
```json
{
  "order_history": [{
    "order_id": "uuid",
    "company_id": "uuid",
    "total": 945,
    "payment_method": "cash",
    "transaction_type": "sale",
    "created_at": "2026-03-05T20:00:00Z",
    "order_items": [{
      "product_name": "Half Sleeve T-Shirt",
      "quantity": 2,
      "unit_price": 450,
      "total": 945
    }]
  }]
}
```

**Note:** Filter `order_items: { order_id: { _is_null: false } }` excludes failed orders with no items.

---

## 7. Create Inventory Transfer

### Step 1: Create Transfer
```graphql
mutation CreateTransfer($transfer: inventory_transfers_insert_input!) {
  insert_inventory_transfers_one(object: $transfer) {
    id
    status
  }
}
```

**Variables:**
```json
{
  "transfer": {
    "source_company_id": "uuid",
    "destination_company_id": "uuid",
    "status": "pending",
    "notes": "Transfer 10 shirts"
  }
}
```

**Note:** `created_by` is NOT required (auto-set by permission). Self-transfers blocked by CHECK constraint.

**Response:**
```json
{ "insert_inventory_transfers_one": { "id": "uuid", "status": "pending" } }
```

### Step 2: Add Transfer Items
```graphql
mutation AddTransferItems($items: [inventory_transfer_items_insert_input!]!) {
  insert_inventory_transfer_items(objects: $items) {
    affected_rows
  }
}
```

**Variables:**
```json
{
  "items": [{
    "transfer_id": "uuid (from step 1)",
    "article_code": "TSH-HS-20",
    "quantity": 10
  }]
}
```

**Possible Errors:**
```
[404] RESOURCE_NOT_FOUND: Product FAKE-123 not found in source company
[422] VALIDATION_ERROR: Insufficient stock for TSH-HS-20 - Total: 100, Reserved: 80, Available: 20, Requested: 25
```

**Note:** Validation checks available stock (physical - already reserved by other pending transfers).

---

## 8. Accept/Reject Transfer

```graphql
mutation UpdateTransfer($id: uuid!, $status: String!, $respondedBy: uuid!) {
  update_inventory_transfers_by_pk(
    pk_columns: { id: $id }
    _set: { status: $status, responded_by: $respondedBy }
  ) {
    id
    status
  }
}
```

**Variables (Accept):**
```json
{ "id": "uuid", "status": "accepted", "respondedBy": "current_user_id" }
```

**Variables (Reject):**
```json
{ "id": "uuid", "status": "rejected", "respondedBy": "current_user_id" }
```

**On Accept:**
- Source company stock is deducted
- Destination company inventory is created (auto-generated article_code) or updated
- Transfer status → "accepted"

**On Reject:**
- No stock movement
- Reserved stock is released
- Transfer status → "rejected"

---

## 9. Fetch Transfers

```graphql
query GetTransfers($companyId: uuid!) {
  inventory_transfers(
    where: {
      _or: [
        { source_company_id: { _eq: $companyId } }
        { destination_company_id: { _eq: $companyId } }
      ]
    }
    order_by: { created_at: desc }
  ) {
    id
    status
    notes
    created_at
    source_company { company_name }
    destination_company { company_name }
    created_by_user { display_name }
    inventory_transfer_items {
      article_code
      quantity
    }
  }
}
```

**Response:**
```json
{
  "inventory_transfers": [{
    "id": "uuid",
    "status": "pending",
    "notes": "Transfer 10 shirts",
    "created_at": "2026-03-05T20:00:00Z",
    "source_company": { "company_name": "Delhi Public School" },
    "destination_company": { "company_name": "Ryan International School" },
    "created_by_user": { "display_name": "Admin" },
    "inventory_transfer_items": [{
      "article_code": "TSH-HS-20",
      "quantity": 10
    }]
  }]
}
```

---

## Price Calculation

```
discount = selling_price × (discount_percentage / 100)
price_after_discount = selling_price - discount
tax = price_after_discount × (tax_percentage / 100)
final_price = price_after_discount + tax
```

**Example:** Price ₹450, Discount 10%, Tax 5%
```
discount = 450 × 0.10 = 45
price_after_discount = 450 - 45 = 405
tax = 405 × 0.05 = 20.25
final_price = 405 + 20.25 = ₹425.25
```

---

## Error Format

All trigger errors follow: `[CODE] ERROR_TYPE: Message - Details`

| Code | Type | When |
|------|------|------|
| 404 | RESOURCE_NOT_FOUND | Product not found in company |
| 422 | VALIDATION_ERROR | Insufficient stock, invalid data |

**Parsing:**
```typescript
const match = message.match(/\[(\d+)\]\s+(\w+):\s+(.+)/);
if (match) {
  const [, code, type, detail] = match;
}
```

---

## Validation Constraints

| Table | Constraint | Rule |
|-------|-----------|------|
| order_items | quantity_positive | quantity > 0 |
| order_items | unit_price_non_negative | unit_price >= 0 |
| inventory_transfer_items | quantity_check | quantity > 0 |
| product_inventory | stock_non_negative | stock >= 0 |
| product_inventory | discount_percentage | 0-100 |
| product_inventory | tax_percentage | 0-100 |
| inventory_transfers | different_companies | source ≠ destination |

---

## Roles & Permissions

| Role | Companies | Inventory | Orders | Transfers |
|------|-----------|-----------|--------|-----------|
| super_admin | View ALL | View ALL | Insert/Update | - |
| sub_admin | View ALL | View ALL | Insert/Update | - |
| company_admin | View assigned | View/Update | Insert/Update/Delete | Create/Accept/Reject |
| employee | View assigned | View/Update | Insert/Update | - |

---

## Testing Checklist

- [x] Login → fetch companies with roles
- [x] Inventory loads with stock + reserved calculation
- [x] Barcode scan returns product
- [x] Create sale → stock deducted
- [x] Sale blocked when quantity > available
- [x] Refund → stock restored
- [x] Create transfer → items validated
- [x] Accept transfer → stock moved to destination
- [x] Reject transfer → stock unchanged
- [x] Self-transfer blocked
- [x] Multiple pending transfers → cumulative reservation
- [x] Re-accept already accepted → no double move
- [x] Accept rejected transfer → no stock move
- [x] Zero/negative quantities blocked
- [x] Non-existent product in transfer → [404] error
- [x] Sale history filters out failed orders
