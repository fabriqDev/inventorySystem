/**
 * Canonical GraphQL / DB column names on `order_item_requests`.
 * Use these everywhere we map UI ↔ API (search, create order nested insert).
 */
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

export interface FetchRequestedOrdersOptions {
  page?: number;
  limit?: number;
  tab: FulfillmentTab;
  /** AND filters on `order_item_requests` (student_name, student_class, phone_number). */
  searchFilters?: RequestItemSearchPayload;
}

export interface FetchRequestedOrderLinesOptions {
  page?: number;
  limit?: number;
}
