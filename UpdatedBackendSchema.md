# School Uniform Inventory System — Progress

**Last Updated:** 2026-03-05 23:17

---

## Database Schema (Hasura/Nhost) ✅ COMPLETE

### Tables (11)
| Table | Purpose | Status |
|-------|---------|--------|
| `companies` | Schools/organizations | ✅ Complete |
| `profiles` | User profiles (auto-synced with auth.users) | ✅ Complete |
| `access_roles` | Roles: super_admin, sub_admin, company_admin, employee | ✅ Complete |
| `user_company_roles` | User-company-role assignments | ✅ Complete |
| `products` | Master product catalog (shared across companies) | ✅ Complete |
| `product_inventory` | Company-specific inventory (article_code as PK) | ✅ Complete |
| `order_history` | Order transaction headers (sales & refunds) | ✅ Complete |
| `order_items` | Order line items | ✅ Complete |
| `inventory_transfers` | Transfer requests between companies | ✅ Complete |
| `inventory_transfer_items` | Items in transfer requests | ✅ Complete |
| ~~`stock_movements`~~ | **REMOVED - simplified to trigger-based updates** | ❌ Deleted |

### Key Fields & Constraints
- `products`: name, year (int), color, uniform_type, uniform_group (all NOT NULL)
- `product_inventory`: **article_code (PK)**, stock >= 0, selling_price >= 0, discount_percentage 0-100
- `access_roles`: **role_type (PK)** - super_admin, sub_admin, company_admin, employee
- `order_history`: **order_id (PK)**, original_order_id (for refunds), transaction_type (sale/refund), total >= 0
- `order_items`: quantity > 0, unit_price >= 0 (NO PK)
- `inventory_transfers`: source_company_id != destination_company_id, status (pending/accepted/rejected)
- `inventory_transfer_items`: quantity > 0 (NO PK)

### Architecture Changes ✅

#### 2026-03-05: Complete System Refactor + Refund/Transfer Features
- **Refund/Exchange system:**
  - Added `original_order_id` to order_history
  - Refunds create negative transactions
  - Exchanges = Refund + New Sale
  - Stock automatically added back on refund
  
- **Inventory transfer system:**
  - Transfer requests between companies
  - Status: pending → accepted/rejected
  - Stock reserved during pending (not deducted)
  - Auto-updates stock on acceptance
  - Validates available stock (physical - reserved)
  
- **Stock reservation logic:**
  - Available stock = physical stock - pending transfers
  - Frontend calculates via `pending_transfer_items_aggregate`
  - Backend validates before sale/transfer
  - Race-condition safe (PostgreSQL row locking)
  
- **Validation constraints:**
  - quantity > 0 (orders, transfers)
  - prices >= 0
  - stock >= 0
  - discount 0-100%
  - No self-transfers
  - totals >= 0

- **Schema changes:**
  - Removed stock_movements table
  - Changed PKs: article_code, role_type, order_id
  - Renamed: sales → order_history, sale_items → order_items
  - Phone numbers: bigint
  - All enums: CHECK constraints

#### 2026-03-04: Category Simplification
- Removed `categories` table dependency
- Added `category` (text) and `uniform_group` (text) columns directly to `products`
- Categories: "T-shirts", "Trousers", "Skirts", etc.
- Groups: "top", "bottom", "accessory"

#### 2026-03-03: Product Catalog Migration
- Products are now shared across companies (one "H/S T-shirt" for all schools)
- Company-specific data (price, stock) moved to `product_inventory` table (renamed from `product_sizes`)
- Each company can have different prices per size
- Same product can exist in multiple companies with independent stock

### Roles & Permissions ✅

#### Role Definitions
| Role | Scope | Tiles | Key Permissions |
|------|-------|-------|-----------------|
| `super_admin` | All companies (system-level) | inventory, sale_history, add_products | Full access to products table, view all data |
| `sub_admin` | All companies (subordinate) | inventory, sale_history, add_products | Same as super_admin |
| `company_admin` | Assigned companies | inventory, new_sale, sale_history, inventory_transfer | Create orders, manage transfers, delete orders |
| `employee` | Single company | inventory, new_sale, sale_history | Create orders, view data |

#### Permission Matrix
| Table | super_admin/sub_admin | company_admin | employee |
|-------|----------------------|---------------|----------|
| `products` | SELECT, INSERT, UPDATE, DELETE | - | - |
| `product_inventory` | SELECT, UPDATE, INSERT, DELETE | SELECT, UPDATE | SELECT, UPDATE |
| `companies` | SELECT, INSERT, UPDATE, DELETE | SELECT | SELECT |
| `order_history` | SELECT | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT, UPDATE |
| `order_items` | SELECT | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT, UPDATE |
| `inventory_transfers` | SELECT | SELECT, INSERT, UPDATE, DELETE | SELECT |
| `profiles` | SELECT, INSERT, DELETE | SELECT (own) | SELECT (own) |
| `user_company_roles` | SELECT, INSERT, UPDATE, DELETE | SELECT (own) | SELECT (own) |

**Note:** All permissions require user to have a valid role in `user_company_roles` enum.

### New Features ✅ (2026-03-03)
**Bulk Stock Update:**
- New tile for super_admin: "Bulk Stock Update"
- Download Excel template with current inventory (includes category & group)
- Upload Excel to update stock (simplified: only "Add Qty" column, no action dropdown)
- Backend: Local test server (needs Nhost deployment)
- Frontend: Complete UI with download/upload

---

## Triggers ✅ COMPLETE

### 1. sync_user_to_profile
**When:** AFTER INSERT on auth.users
**Action:** Auto-creates profile record
**Purpose:** Keep profiles in sync with auth

### 2. deduct_stock_on_sale
**When:** BEFORE INSERT on order_items
**Action:** 
- Validates available stock (physical - reserved)
- Deducts stock for sales
**Validation:** Raises exception if insufficient stock

### 3. add_stock_on_refund
**When:** AFTER INSERT on order_items
**Action:** Adds stock back if transaction_type = 'refund'
**Purpose:** Automatic refund processing

### 4. validate_transfer_stock
**When:** BEFORE INSERT on inventory_transfer_items
**Action:** Validates available stock (excluding other pending transfers)
**Validation:** Raises exception if insufficient stock

### 5. process_inventory_transfer
**When:** AFTER UPDATE on inventory_transfers (status change)
**Action:**
- If accepted: Deduct from source, add to destination
- If rejected: No stock changes
**Purpose:** Automatic transfer processing

## Relationships ✅ COMPLETE

### companies
- **Array:** user_company_roles, inventory (product_inventory), orders (order_history)

### profiles  
- **Array:** user_company_roles, orders, created_transfers, responded_transfers

### products
- **Array:** inventory (product_inventory)

### product_inventory
- **Object:** company, product
- **Array:** pending_transfer_items (for calculating reserved stock)

### order_history
- **Object:** company, user, original_order (for refunds)
- **Array:** order_items, refunds (all refunds for this sale)

### order_items
- **Object:** order (order_history), product_inventory

### inventory_transfers
- **Object:** source_company, destination_company, created_by_user, responded_by_user
- **Array:** items (inventory_transfer_items)

### inventory_transfer_items
- **Object:** transfer, product_inventory

---

## Backend Validations ✅ COMPLETE

### Trigger Validations
1. **Sale stock validation** - Available stock check before deduction
2. **Transfer stock validation** - Available stock check before reservation
3. **Refund stock addition** - Automatic stock restoration
4. **Transfer acceptance** - Stock movement between companies

### CHECK Constraints
- Quantity > 0 (orders, transfers)
- Prices >= 0
- Stock >= 0
- Discount 0-100%
- No self-transfers
- Totals >= 0
- Enum validations (roles, payment methods, statuses)

### Hasura Permissions
- Role-based access (super_admin, sub_admin, company_admin, employee)
- Company-level isolation
- Operation-specific permissions

### Race Condition Protection
- PostgreSQL row-level locking
- Serialized concurrent operations
- Stock never goes negative

## Core Features ✅ COMPLETE

### 1. Sales Management
- Create sales with multiple items
- Real-time stock deduction
- Available stock calculation (physical - reserved)
- Payment methods: cash, online
- Status tracking: pending, failed, success

### 2. Refund/Return System
- Full refunds (return all items)
- Partial refunds (return some items)
- Automatic stock restoration
- Money tracking (negative transactions)
- Linked to original sale via `original_order_id`

### 3. Exchange/Replacement
- Handled as Refund + New Sale
- Supports price differences
- Size changes, product swaps
- Complete audit trail

### 4. Inventory Transfers
- Transfer requests between companies
- Status workflow: pending → accepted/rejected
- Stock reservation during pending
- Automatic stock updates on acceptance
- Validates available stock (excludes reserved)

### 5. Stock Management
- Reserved stock tracking (pending transfers)
- Available stock = physical - reserved
- Frontend: Query + Refetch approach (no subscriptions)
- Backend: Trigger-based validation
- Race-condition safe

### 6. Multi-Company Support
- Shared product catalog
- Company-specific inventory & pricing
- Role-based access control
- Company-level data isolation

### 7. Role-Based Access
- super_admin: Full system access
- sub_admin: Same as super_admin
- company_admin: Manage company operations, transfers
- employee: Create sales, view data

---

## Implementation Approach

### Frontend Strategy
**Query + Refetch (No Subscriptions)**
- Initial load: Query inventory once
- Before action: Refetch to get latest stock
- Validate: Check available stock
- Submit: Backend validates again (double safety)
- After success: Refetch to show updated data

**Benefits:**
- ✅ No subscription costs
- ✅ Validates before action
- ✅ Backend double-checks
- ✅ Good enough for most cases

### Backend Strategy
**Trigger-Based Validation**
- All stock operations validated by triggers
- Available stock calculated dynamically
- PostgreSQL row locking prevents race conditions
- CHECK constraints as final safety net

---

## Tested Flows ✅

### 1. Create Sale
- Fetch inventory with reserved stock
- Refetch before submit
- Validate available stock
- Create order → Trigger deducts stock
- Success

### 2. Create Refund
- Fetch original sale
- Select items to return
- Calculate refund amount
- Create refund order → Trigger adds stock back
- Success

### 3. Exchange Item
- Create refund (return old)
- Create new sale (sell new)
- Handle price difference
- Both stocks updated correctly

### 4. Create Transfer
- Fetch inventory with reserved stock
- Refetch before submit
- Validate available stock
- Create transfer → Trigger validates, reserves stock
- Success

### 5. Accept Transfer
- Update status to 'accepted'
- Trigger deducts from source, adds to destination
- Reserved stock freed
- Success

### 6. Concurrent Operations
- Two users sell same product
- First succeeds, second fails with clear error
- Stock never goes negative
- Success

---

### Structure
```
app/
├── (auth)/
│   └── login.tsx
├── (tabs)/
│   └── index.tsx          # Company list (home)
├── company/
│   └── [id]/
│       ├── index.tsx      # Tiles dashboard
│       ├── inventory.tsx
│       ├── orders.tsx
│       └── create-order.tsx
```

### Updated Files

**`types/tiles.ts`**
```typescript
export type TileId = 'inventory' | 'sale_history' | 'new_sale';
```

**`app/company/[id]/index.tsx`** — TILE_CONFIG
```typescript
const TILE_CONFIG = {
  inventory: { label: 'Inventory', icon: 'archivebox.fill' },
  sale_history: { label: 'Sales', icon: 'chart.bar.fill' },
  new_sale: { label: 'New Sale', icon: 'cart.fill' },
};
```

**`lib/backend/nhost.ts`** — Companies query
```graphql
query GetCompanies($userId: uuid!) {
  user_company_roles(
    where: { user_id: { _eq: $userId }, is_active: { _eq: true } }
  ) {
    company {
      id
      name: company_name
      slug: company_code
      address
      created_at
      updated_at
    }
    access_role {
      role_name
      visible_tiles
    }
  }
}
```

---

## Tested Queries ✅

### 1. Inventory
```graphql
query GetInventory($companyId: uuid!) {
  product_inventory(where: { company_id: { _eq: $companyId } }) {
    article_code
    size
    stock
    selling_price
    tax_percentage
    product { id name color year }
  }
}
```

### 2. Barcode Scan
```graphql
query ScanBarcode($barcode: String!, $companyId: uuid!) {
  product_inventory(
    where: { 
      barcode: { _eq: $barcode }
      company_id: { _eq: $companyId }
      is_active: { _eq: true } 
    }
  ) {
    id size stock selling_price tax_percentage
    product { id name color year }
    company { company_name }
  }
}
```

### 3. Create Sale
```graphql
mutation CreateSale {
  insert_sales_one(object: {
    company_id: "..."
    subtotal: 450
    tax_amount: 22.50
    total: 472.50
    payment_method: "cash"
    sale_items: {
      data: [{
        product_id: "..."
        size_id: "..."
        product_name: "H/S T-shirt (Orange)"
        size: "22"
        quantity: 1
        unit_price: 450
        tax_percentage: 5
        tax_amount: 22.50
        total: 472.50
      }]
    }
  }) {
    id sale_number total
  }
}
```

### 4. Sale History
```graphql
query GetSaleHistory($companyId: uuid!) {
  sales(where: { company_id: { _eq: $companyId } }, order_by: { created_at: desc }) {
    sale_number total payment_method created_at
    sale_items { product_name size quantity total }
  }
}
```

---

## Mock Data ✅

**Company:** `19417192-fdae-42c3-b209-283f9859419d` (Mock Delhi Public School)

**Products:**
| Name | Code | Category | Sizes |
|------|-----|----------|-------|
| H/S T-shirt | RAD-TSH-ORA | T-shirts | 20, 22, 24, 26 |
| Navy Check Trousers | RAD-TRS-001 | Trousers | 26x24, 26x26, 28x24 |
| Navy Check Divided Skirt | RAD-SKT-001 | Skirts | 18X24, 20X26 |

**Categories:** T-shirts, Shirts, Trousers, Skirts, Shorts, Half Pants, Lowers, Sweaters, Socks, Belts

---

## Pending Tasks

### High Priority
- [ ] Frontend: Implement Query + Refetch pattern for inventory
- [ ] Frontend: Add available stock calculation (physical - reserved)
- [ ] Frontend: Implement refund/return UI
- [ ] Frontend: Implement exchange UI
- [ ] Frontend: Implement inventory transfer UI
- [ ] Frontend: Add manual refresh button on inventory page

### Medium Priority
- [ ] Deploy bulk stock update functions to Nhost (currently running locally)
- [ ] Add transfer timeout/auto-reject after X days
- [ ] Add transfer cancellation (by creator, before acceptance)
- [ ] Add partial transfer acceptance
- [ ] Product tag generation

### Low Priority
- [ ] Add transfer history view
- [ ] Add refund analytics
- [ ] Add stock movement reports
- [ ] Add low stock alerts

### Documentation
- [x] Backend implementation complete
- [x] Database schema documented
- [x] Validation rules documented
- [ ] Frontend implementation guide
- [ ] API documentation
- [ ] User manual

---

## System Status

### Backend: ✅ PRODUCTION READY
- 11 tables with complete schema
- 15+ relationships configured
- 5 triggers for automatic processing
- 20+ validation rules (triggers + constraints + permissions)
- Race-condition safe
- Multi-company support
- Role-based access control
- Refund/exchange system
- Inventory transfer system
- Stock reservation logic

### Frontend: ⚠️ IN PROGRESS
- Basic structure complete
- Needs: Query + Refetch implementation
- Needs: Available stock calculation
- Needs: Refund/exchange UI
- Needs: Transfer UI

### Deployment: ⚠️ PARTIAL
- Database: ✅ Deployed on Nhost
- Backend functions: ⚠️ Local only (bulk stock)
- Frontend: ⚠️ Development

---

| Category | Format |
|----------|--------|
| T-shirts | 20, 22, 24, 26 |
| Trousers | 26x24, 28x26 (waist×length) |
| Skirts | 18X24, 20X26 |
| Shorts | S, M, L, XL |

## scan_code Format
```
Code + Size → RAD-TSH-ORA-22
```
