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
