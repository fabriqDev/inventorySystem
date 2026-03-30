/**
 * Canonical GraphQL / DB column names on `order_item_requests`.
 * Use these everywhere we map UI ↔ API (search, create order nested insert).
 */

/** For server `order_id` `_eq` only (Hasura `uuid` has no `_ilike` / `_cast` in comparisons). */
export const ORDER_ID_FULL_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const OrderItemRequestField = {
  STUDENT_NAME: 'student_name',
  STUDENT_CLASS: 'student_class',
  PHONE_NUMBER: 'phone_number',
} as const;

export type OrderItemRequestFieldKey =
  (typeof OrderItemRequestField)[keyof typeof OrderItemRequestField];

/** Filters for requested-orders list; each set field is AND-matched with `_ilike` on the server. */
export type RequestItemSearchPayload = Partial<Record<OrderItemRequestFieldKey, string>>;

/** Tab on requested-orders list: pending vs completed (no pending request lines). */
export type FulfillmentTab = 'unfulfilled' | 'fulfilled';

/** One row in the bundled list (order + summary student info for the cell). */
export interface RequestedOrderListRow {
  order_id: string;
  created_at: string;
  total: number;
  /** First request row’s student (same meta is usually repeated per line). */
  student_name: string;
  student_class: string;
  /** True if multiple distinct student pairs exist on request lines (rare). */
  has_multiple_students: boolean;
}

/** One request line on the detail screen (paginated). */
export interface RequestedOrderLine {
  /** Stable key: article_code + index or order_item id if present */
  line_key: string;
  /** The `order_item_requests.id` — used for selective fulfillment. */
  request_id: string;
  article_code: string;
  /** From joined `product.size` when available. */
  size?: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
  student_name: string;
  student_class: string;
  phone_number?: string;
  fulfillment_status: string;
}

export interface RequestedOrdersResponse {
  orders: RequestedOrderListRow[];
  totalCount: number;
}

export interface RequestedOrderLinesResponse {
  lines: RequestedOrderLine[];
  totalCount: number;
}

/** PDF export variant: which request lines to include per order. */
export type RequestedOrdersPdfVariant = 'unfulfilled' | 'fulfilled';

/** One PDF page: one order and its request lines for the chosen export variant. */
export interface RequestedOrderPdfPage {
  order_id: string;
  created_at: string;
  total: number;
  /** Pending lines for unfulfilled export; fulfilled lines for fulfilled export. */
  lines: RequestedOrderLine[];
}

export interface FetchRequestedOrdersOptions {
  page?: number;
  limit?: number;
  tab: FulfillmentTab;
  /** AND filters on `order_item_requests` (student_name, student_class, phone_number). */
  searchFilters?: RequestItemSearchPayload;
  /**
   * When set to a **full UUID** string, filters with `order_id` `_eq` (optional `#` stripped).
   * Partial / contains matching is done in the client after loading the tab (see list screen).
   */
  orderIdSearch?: string;
}

export interface FetchRequestedOrderLinesOptions {
  page?: number;
  limit?: number;
}
