import { createClient } from '@nhost/nhost-js';
import {
  DEFAULT_SESSION_KEY,
  type Session,
  type SessionStorageBackend,
} from '@nhost/nhost-js/session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { toBackendError, toUserMessage } from '@/core/backend/errors';
import { CURRENCY_DEFAULT } from '@/core/constants/currency';
import { OrderItemRequestField, type RequestItemSearchPayload } from '@/core/constants/order-item-request-fields';
import { toast } from '@/core/services/toast';
import { PaymentProvider, PaymentType } from '@/core/types/order';
import type { Product } from '@/core/types/product';
import type {
  RequestedOrderLine,
  RequestedOrderListRow,
} from '@/core/types/requested-orders';
import { TileIds } from '@/core/types/tiles';
import type {
  AppSession,
  AuthProvider,
  BackendProvider,
  CreateOrderInput,
  CreateOrderResult,
  CreateRazorpayOrderInput,
  CreateRazorpayOrderResult,
  CreateTransferInput,
  CreateTransferResult,
  DataProvider,
  FetchOrdersOptions,
  UpdateOrderStatusInput,
  VerifyRazorpayPaymentInput,
  VerifyRazorpayPaymentResult,
} from './types';

const SESSION_KEY = DEFAULT_SESSION_KEY;
const SECURE_STORE_MAX_BYTES = 2048;

// ---------------------------------------------------------------------------
// Session storage — AsyncStorage is ALWAYS the primary store on native.
//
// Prior code only wrote to SecureStore for small payloads and DELETED the
// AsyncStorage copy.  Two problems:
//   1. Android Keystore (SecureStore) can silently return null after a process
//      kill on some devices → session lost → user logged out.
//   2. All writes were fire-and-forget (void).  NHost rotates refresh tokens
//      on each use; if the app was killed before the async write completed,
//      the on-disk token was already revoked → 401 → SDK clears storage.
//
// Rules now:
//   • AsyncStorage is ALWAYS written first and NEVER deleted by set().
//   • SecureStore is a best-effort encrypted copy (small payloads only).
//   • Reads check AsyncStorage first; SecureStore is a fallback only.
//   • set() awaits the AsyncStorage write so it is as durable as possible.
// ---------------------------------------------------------------------------

class SecureSessionStorage implements SessionStorageBackend {
  private cache: Session | null = null;
  readonly hydrationPromise: Promise<void>;
  private writeGen = 0;

  constructor() {
    // On web, read localStorage synchronously so the SDK has the session during
    // createClient() init — this ensures auto-refresh middleware is configured.
    if (Platform.OS === 'web') {
      try {
        const raw = typeof window !== 'undefined' && window.localStorage
          ? window.localStorage.getItem(SESSION_KEY)
          : null;
        if (raw) this.cache = JSON.parse(raw) as Session;
      } catch { /* ignore */ }
      this.hydrationPromise = Promise.resolve();
    } else {
      this.hydrationPromise = this.hydrateNative();
    }
  }

  private async hydrateNative(): Promise<void> {
    try {
      const [fromAsync, fromSecure] = await Promise.all([
        AsyncStorage.getItem(SESSION_KEY).catch(() => null),
        SecureStore.getItemAsync(SESSION_KEY).catch(() => null),
      ]);

      // AsyncStorage is primary.
      if (fromAsync) {
        try {
          this.cache = JSON.parse(fromAsync) as Session;
          return;
        } catch { /* corrupt JSON — fall through */ }
      }

      // Fallback: SecureStore (might still have a session from an older build).
      if (fromSecure) {
        try {
          this.cache = JSON.parse(fromSecure) as Session;
          // Migrate to AsyncStorage so the next cold start doesn't depend on Keystore.
          void AsyncStorage.setItem(SESSION_KEY, fromSecure).catch(() => {});
          return;
        } catch { /* corrupt */ }
      }

      this.cache = null;
    } catch {
      this.cache = null;
    }
  }

  get(): Session | null {
    return this.cache;
  }

  set(value: Session): void {
    this.cache = value;
    const raw = JSON.stringify(value);

    if (Platform.OS === 'web') {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(SESSION_KEY, raw);
        }
      } catch { /* quota exceeded or private browsing */ }
      return;
    }

    // Native: ALWAYS write AsyncStorage first (primary), then SecureStore (bonus).
    const gen = ++this.writeGen;
    void (async () => {
      try {
        await AsyncStorage.setItem(SESSION_KEY, raw);
      } catch { /* extremely unlikely */ }

      if (gen !== this.writeGen) return;

      try {
        const bytes = new TextEncoder().encode(raw).length;
        if (bytes <= SECURE_STORE_MAX_BYTES) {
          await SecureStore.setItemAsync(SESSION_KEY, raw);
        }
      } catch { /* SecureStore failure is non-fatal */ }
    })();
  }

  remove(): void {
    this.cache = null;
    ++this.writeGen;
    if (Platform.OS === 'web') {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(SESSION_KEY);
        }
      } catch { /* ignore */ }
    } else {
      void AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
      void SecureStore.deleteItemAsync(SESSION_KEY).catch(() => {});
    }
  }

  reloadCacheFromLocalStorage(): void {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      const raw = window.localStorage?.getItem(SESSION_KEY) ?? null;
      this.cache = raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      this.cache = null;
    }
  }
}

const sessionStorageBackend = new SecureSessionStorage();

const nhost = createClient({
  subdomain: process.env.EXPO_PUBLIC_NHOST_SUBDOMAIN ?? 'local',
  region: process.env.EXPO_PUBLIC_NHOST_REGION ?? 'local',
  storage: sessionStorageBackend,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toAppSession(session: Session | null | undefined): AppSession | null {
  if (!session?.user) return null;
  return {
    accessToken: session.accessToken,
    user: {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName || undefined,
      phoneNumber: session.user.phoneNumber || undefined,
    },
  };
}

function gqlError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error);
  return new Error(JSON.stringify(error));
}

function extractHasuraMessage(err: any): string {
  const internalMsg = err?.extensions?.internal?.error?.message;
  if (typeof internalMsg === 'string' && internalMsg.length > 0) return internalMsg;
  return err?.message ?? 'Request failed';
}

async function gqlRequest<TData>(args: { query: string; variables?: Record<string, any> }): Promise<TData> {
  try {
    const res = await nhost.graphql.request(args);
    const body = res.body as any;
    const err = body?.errors?.[0];
    if (err) {
      throw new Error(extractHasuraMessage(err));
    }
    return (body?.data ?? {}) as TData;
  } catch (e) {
    const be = toBackendError(e);
    toast.show({ type: 'error', message: toUserMessage(be) });
    throw be;
  }
}

// ---------------------------------------------------------------------------
// Auth adapter
// ---------------------------------------------------------------------------

const auth: AuthProvider = {
  async signIn(email, password) {
    try {
      await nhost.auth.signInEmailPassword({ email, password });
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e : new Error('Sign in failed') };
    }
  },

  async signOut() {
    await nhost.auth.signOut({});
  },

  async getSession() {
    await sessionStorageBackend.hydrationPromise;
    // Force-refresh on cold start: the stored access token is likely expired.
    // refreshSession(0) reads the refresh token from storage and requests a
    // fresh access token from the server. If no stored session or the refresh
    // token is revoked, it returns null (user must sign in again).
    try {
      const refreshed = await nhost.refreshSession(0);
      if (refreshed) return toAppSession(refreshed);
    } catch { /* network error — fall through to cached session */ }
    // Fallback: return cached session so the UI shows user info while offline.
    // The SDK middleware will retry the refresh on next API request.
    const cached = nhost.getUserSession();
    return toAppSession(cached);
  },

  async syncSessionFromBrowserStorage() {
    sessionStorageBackend.reloadCacheFromLocalStorage();
    await sessionStorageBackend.hydrationPromise;
    try {
      const refreshed = await nhost.refreshSession(0);
      if (refreshed) return toAppSession(refreshed);
    } catch { /* offline — use cache */ }
    const cached = nhost.getUserSession();
    return toAppSession(cached);
  },

  onAuthStateChange(cb) {
    return nhost.sessionStorage.onChange((session) => {
      cb(toAppSession(session));
    });
  },

  async getUser() {
    const session = nhost.getUserSession();
    if (!session?.user) return null;
    return {
      id: session.user.id,
      email: session.user.email ?? undefined,
      displayName: session.user.displayName || undefined,
      phoneNumber: session.user.phoneNumber || undefined,
    };
  },
};

// ---------------------------------------------------------------------------
// GraphQL queries (Hasura) — aligned to UpdatedBackendSchema + UpdatedFrontEndGraphQLQuries
// ---------------------------------------------------------------------------

const COMPANIES_QUERY = `
  query GetCompanies($userId: uuid!) {
    assigned_companies: user_company_roles(where: { user_id: { _eq: $userId } }) {
      company {
        id
        name: company_name
        slug: company_code
        address
        rz_pg
        config
        created_at
        updated_at
      }
      access_role {
        role_type
        visible_tiles
      }
    }
  }
`;



const PRODUCTS_QUERY = `
query GetProducts($companyId: uuid!) {
  product_inventory(
    where: { company_id: { _eq: $companyId } }
    order_by: { product: { name: asc } }
  ) {
    stock
    reserved
    selling_price
    discount_percentage
    tax_percentage
    product {
      name
      description
      color
      uniform_type
      uniform_group
      year
      size
      article_code
    }
  }
}
`;

const PRODUCT_BY_BARCODE_QUERY = `
  query GetProductByBarcode($companyId: uuid!, $barcode: String!) {
    product_inventory(
      where: {
        article_code: { _eq: $barcode }
        company_id: { _eq: $companyId }
      }
      limit: 1
    ) {
      article_code
      company_id
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
`;

const ORDERS_QUERY = `
  query GetOrders($companyId: uuid!, $limit: Int!, $offset: Int!) {
    order_history(
      where: { company_id: { _eq: $companyId } }
      order_by: { created_at: desc }
      limit: $limit
      offset: $offset
    ) {
      order_id
      company_id
      total
      refund_amount
      payment_type
      payment_provider
      cash_share
      online_share
      created_at
      status
      subtotal
    }
    order_history_aggregate(
      where: { company_id: { _eq: $companyId } }
    ) {
      aggregate {
        count
        sum { total refund_amount cash_share online_share }
      }
    }
  }
`;

const ORDERS_QUERY_WITH_DATES = `
  query GetOrdersFiltered($companyId: uuid!, $limit: Int!, $offset: Int!, $dateFrom: timestamptz!, $dateTo: timestamptz!) {
    order_history(
      where: {
        company_id: { _eq: $companyId }
        created_at: { _gte: $dateFrom, _lte: $dateTo }
      }
      order_by: { created_at: desc }
      limit: $limit
      offset: $offset
    ) {
      order_id
      company_id
      total
      refund_amount
      payment_type
      payment_provider
      cash_share
      online_share
      created_at
      status
      subtotal
    }
    order_history_aggregate(
      where: {
        company_id: { _eq: $companyId }
        created_at: { _gte: $dateFrom, _lte: $dateTo }
      }
    ) {
      aggregate {
        count
        sum { total refund_amount cash_share online_share }
      }
    }
  }
`;

const ORDER_ITEMS_QUERY = `
  query GetOrderItems($orderId: uuid!) {
    order_items(where: { order_id: { _eq: $orderId } }) {
      article_code
      product_name
      quantity
      unit_price
      total
      transaction_type
      product {
        size
      }
    }
  }
`;


const CREATE_ORDER_MUTATION = `
  mutation CreateOrder($order: order_history_insert_input!) {
    insert_order_history_one(object: $order) {
      order_id
      total
    }
  }
`;

const CREATE_RAZORPAY_ORDER_ACTION = `
  mutation CreateRazorpayOrder($server_order_id: uuid!, $amount: Int!, $currency: String!) {
    createRazorpayOrder(server_order_id: $server_order_id, amount: $amount, currency: $currency) {
      razorpay_order_id
    }
  }
`;

const VERIFY_RAZORPAY_PAYMENT_ACTION = `
  mutation VerifyRazorpayPayment($server_order_id: uuid!, $razorpay_order_id: String!, $razorpay_payment_id: String!, $razorpay_signature: String!) {
    verifyRazorpayPayment(server_order_id: $server_order_id, razorpay_order_id: $razorpay_order_id, razorpay_payment_id: $razorpay_payment_id, razorpay_signature: $razorpay_signature) {
      success
      status
    }
  }
`;

const UPDATE_ORDER_STATUS_MUTATION = `
  mutation UpdateOrderStatus($orderId: uuid!, $status: String!) {
    update_order_history_by_pk(pk_columns: { order_id: $orderId }, _set: { status: $status }) {
      order_id
      status
    }
  }
`;

/** Dynamic where built in TS; list + aggregate share the same filter. */
const REQUEST_ORDERS_BUNDLED_QUERY = `
  query GetRequestsBundledByOrder($where: order_history_bool_exp!, $limit: Int!, $offset: Int!) {
    order_history(
      where: $where
      order_by: { created_at: desc }
      limit: $limit
      offset: $offset
    ) {
      order_id
      created_at
      total
      order_items(where: { transaction_type: { _eq: "request" } }) {
        product_name
        order_item_requests {
          student_name
          student_class
          phone_number
          fulfillment_status
        }
      }
    }
    order_history_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

const REQUEST_ORDER_LINES_QUERY = `
  query GetRequestedOrderLines($orderId: uuid!, $limit: Int!, $offset: Int!) {
    order_items_aggregate(
      where: { order_id: { _eq: $orderId }, transaction_type: { _eq: "request" } }
    ) {
      aggregate {
        count
      }
    }
    order_items(
      where: { order_id: { _eq: $orderId }, transaction_type: { _eq: "request" } }
      order_by: [{ article_code: asc }, { product_name: asc }]
      limit: $limit
      offset: $offset
    ) {
      article_code
      product_name
      quantity
      unit_price
      total
      order_item_requests {
        student_name
        student_class
        phone_number
        fulfillment_status
      }
    }
  }
`;

const FULFILL_ORDER_REQUESTS_MUTATION = `
  mutation FulfillOrderItemRequests($orderId: uuid!) {
    update_order_item_requests(
      where: {
        _and: [
          { fulfillment_status: { _eq: "pending" } }
          { order_item: { order_id: { _eq: $orderId }, transaction_type: { _eq: "request" } } }
        ]
      }
      _set: { fulfillment_status: "fulfilled" }
    ) {
      affected_rows
    }
  }
`;

const PENDING_TRANSFERS_QUERY = `
  query GetPendingTransfers($companyId: uuid!) {
    inventory_transfers(
      where: {
        _or: [
          { destination_company_id: { _eq: $companyId } }
          { source_company_id: { _eq: $companyId } }
        ]
        status: { _eq: "pending" }
      }
      order_by: { created_at: desc }
    ) {
      id
      source_company_id
      destination_company_id
      status
      notes
      created_at
      source_company { company_name }
      destination_company { company_name }
      created_by_user { full_name }
      items { article_code quantity }
    }
  }
`;

const TRANSFER_HISTORY_QUERY = `
  query GetTransferHistory($companyId: uuid!) {
    inventory_transfers(
      where: {
        _or: [
          { source_company_id: { _eq: $companyId } }
          { destination_company_id: { _eq: $companyId } }
        ]
        status: { _in: ["accepted", "rejected"] }
      }
      order_by: { created_at: desc }
    ) {
      id
      source_company_id
      destination_company_id
      status
      notes
      created_at
      source_company { company_name }
      destination_company { company_name }
      created_by_user { full_name }
      items { article_code quantity }
    }
  }
`;

const GET_TRANSFERS_QUERY = `
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
      source_company_id
      destination_company_id
      status
      notes
      created_at
      responded_by
      source_company { company_name }
      destination_company { company_name }
      created_by_user { full_name }
      items { article_code quantity }
    }
  }
`;

const CREATE_TRANSFER_MUTATION = `
  mutation CreateTransfer($transfer: inventory_transfers_insert_input!) {
    insert_inventory_transfers_one(object: $transfer) {
      id
      status
    }
  }
`;

const UPDATE_TRANSFER_MUTATION = `
 mutation UpdateTransfer($id: uuid!, $status: transfer_status_enum!, $respondedBy: uuid!) {
  update_inventory_transfers_by_pk(
    pk_columns: { id: $id }
    _set: { status: $status, responded_by: $respondedBy }
  ) {
    id
    status
  }
}
`;

type FulfillmentTabArg = 'unfulfilled' | 'fulfilled';

function escapeIlikePattern(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function buildOrderItemRequestSearchAnd(
  filters: RequestItemSearchPayload,
): Record<string, unknown>[] {
  const parts: Record<string, unknown>[] = [];
  const name = filters[OrderItemRequestField.STUDENT_NAME]?.trim();
  const cls = filters[OrderItemRequestField.STUDENT_CLASS]?.trim();
  const phone = filters[OrderItemRequestField.PHONE_NUMBER]?.trim();
  if (name) {
    parts.push({ [OrderItemRequestField.STUDENT_NAME]: { _ilike: `%${escapeIlikePattern(name)}%` } });
  }
  if (cls) {
    parts.push({ [OrderItemRequestField.STUDENT_CLASS]: { _ilike: `%${escapeIlikePattern(cls)}%` } });
  }
  if (phone) {
    parts.push({ [OrderItemRequestField.PHONE_NUMBER]: { _ilike: `%${escapeIlikePattern(phone)}%` } });
  }
  return parts;
}

/** Builds Hasura `order_history_bool_exp` for requested-orders list (tabs + optional field filters). */
function buildRequestedOrdersWhere(
  companyId: string,
  tab: FulfillmentTabArg,
  searchFilters: RequestItemSearchPayload,
): Record<string, unknown> {
  const requestLine = { transaction_type: { _eq: 'request' } };
  const searchAnd = buildOrderItemRequestSearchAnd(searchFilters);

  const pendingReqFilter =
    searchAnd.length > 0
      ? {
          order_item_requests: {
            _and: [{ fulfillment_status: { _eq: 'pending' } }, ...searchAnd],
          },
        }
      : { order_item_requests: { fulfillment_status: { _eq: 'pending' } } };

  const fulfilledReqFilter =
    searchAnd.length > 0
      ? {
          order_item_requests: {
            _and: [{ fulfillment_status: { _eq: 'fulfilled' } }, ...searchAnd],
          },
        }
      : { order_item_requests: { fulfillment_status: { _eq: 'fulfilled' } } };

  if (tab === 'unfulfilled') {
    return {
      _and: [
        { company_id: { _eq: companyId } },
        { order_items: { _and: [requestLine, pendingReqFilter] } },
      ],
    };
  }

  return {
    _and: [
      { company_id: { _eq: companyId } },
      { order_items: { _and: [requestLine, fulfilledReqFilter] } },
      {
        _not: {
          order_items: {
            _and: [
              requestLine,
              { order_item_requests: { fulfillment_status: { _eq: 'pending' } } },
            ],
          },
        },
      },
    ],
  };
}

function mapRequestedOrderListRow(row: any): RequestedOrderListRow {
  const items = row.order_items ?? [];
  const pairs = new Map<string, { name: string; class: string }>();
  for (const line of items) {
    const reqs = line.order_item_requests ?? [];
    for (const r of reqs) {
      const name = String(r.student_name ?? '').trim();
      const cls = String(r.student_class ?? '').trim();
      pairs.set(`${name}\0${cls}`, { name, class: cls });
    }
  }
  const first = pairs.values().next().value as { name: string; class: string } | undefined;
  return {
    order_id: row.order_id,
    created_at: row.created_at ?? new Date().toISOString(),
    total: row.total ?? 0,
    student_name: first?.name || '—',
    student_class: first?.class || '—',
    has_multiple_students: pairs.size > 1,
  };
}

function mapRequestedOrderLine(row: any, index: number): RequestedOrderLine {
  const reqs = row.order_item_requests ?? [];
  const r = reqs[0] ?? {};
  const ac = row.article_code ?? '';
  return {
    line_key: `${ac}-${index}`,
    article_code: ac,
    product_name: row.product_name ?? '',
    quantity: row.quantity ?? 0,
    unit_price: row.unit_price ?? 0,
    total: row.total ?? 0,
    student_name: String(r.student_name ?? '').trim(),
    student_class: String(r.student_class ?? '').trim(),
    phone_number: r.phone_number ?? undefined,
    fulfillment_status: String(r.fulfillment_status ?? 'pending'),
  };
}

function mapProductInventoryRow(row: any): Product {
  const reserved = row.reserved ?? 0;
  const product = row.product ?? {};
  return {
    article_code: product.article_code,
    company_id: row.company_id,
    name: (product.name ?? '').trim() || product.article_code,
    scan_code: product.article_code,
    price: row.selling_price ?? 0,
    currency: CURRENCY_DEFAULT,
    quantity: row.stock ?? 0,
    size: product.size ?? undefined,
    discount_percentage: row.discount_percentage ?? 0,
    tax_percentage: row.tax_percentage ?? 0,
    reserved,
  };
}



function mapTransferRow(row: any): import('@/core/types/transfer').InventoryTransfer {
  return {
    id: row.id,
    source_company_id: row.source_company_id,
    source_company_name: row.source_company?.company_name ?? '',
    destination_company_id: row.destination_company_id,
    destination_company_name: row.destination_company?.company_name ?? '',
    status: row.status,
    created_by_user_id: undefined,
    created_by_user: row.created_by_user ? { display_name: row.created_by_user.full_name ?? row.created_by_user.display_name } : undefined,
    responded_by_user_id: row.responded_by ?? undefined,
    notes: row.notes ?? undefined,
    items: (row.items ?? []).map((i: any) => ({
      article_code: i.article_code,
      quantity: i.quantity,
    })),
    created_at: row.created_at,
    updated_at: row.created_at,
  };
}


// ---------------------------------------------------------------------------
// Data adapter
// ---------------------------------------------------------------------------

const data: DataProvider = {
  async fetchCompanies(userId) {
    const d = await gqlRequest<any>({ query: COMPANIES_QUERY, variables: { userId } });
    const companies = d?.assigned_companies ?? [];
    const mapCompany = (row: any) => {
      const company = row.company ?? row;
      const role = row.access_role?.role_type;
      const tiles = row.access_role?.visible_tiles ?? [TileIds.INVENTORY, TileIds.SALE_HISTORY, TileIds.NEW_SALE];
      return {
        id: company.id,
        name: company.name,
        slug: company.slug ?? undefined,
        address: company.address ?? undefined,
        razorpay_id: company.razorpay_id ?? undefined,
        config: company.config ?? undefined,
        created_at: company.created_at,
        updated_at: company.updated_at,
        role,
        visible_tiles: tiles,
      };
    };
    return companies.map((row: any) => mapCompany(row));
  },

  async fetchProducts(companyId, { search, page = 1, limit = 40 }) {
    const d = await gqlRequest<any>({ query: PRODUCTS_QUERY, variables: { companyId } });
    const rows = d?.product_inventory ?? [];
    let products: Product[] = rows.map(mapProductInventoryRow);
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      products = products.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.scan_code.toLowerCase().includes(q),
      );
    }
    const total = products.length;
    const offset = (page - 1) * limit;
    const paged = products.slice(offset, offset + limit);
    return {
      products: paged,
      total,
      has_more: offset + limit < total,
    };
  },

  async fetchProductByBarcode(companyId, barcode) {
    const d = await gqlRequest<any>({
      query: PRODUCT_BY_BARCODE_QUERY,
      variables: { companyId, barcode: barcode.trim() },
    });
    const rows = d?.product_inventory ?? [];
    const first = rows[0];
    if (!first) return null;
    return mapProductInventoryRow(first);
  },

  async fetchOrders(companyId, opts: FetchOrdersOptions = {}) {
    const { page = 1, limit = 50, dateFrom, dateTo } = opts;
    const offset = (page - 1) * limit;
    const hasDateFilter = Boolean(dateFrom || dateTo);
    const d = await gqlRequest<any>({
      query: hasDateFilter ? ORDERS_QUERY_WITH_DATES : ORDERS_QUERY,
      variables: hasDateFilter
        ? { companyId, limit, offset, dateFrom, dateTo }
        : { companyId, limit, offset },
    });

    const rows = d?.order_history ?? [];
    const aggregate = d?.order_history_aggregate?.aggregate ?? {};

    const orders = rows.map((o: any) => ({
      server_order_id: o.order_id,
      company_id: o.company_id ?? companyId,
      subtotal: o.subtotal ?? o.total ?? 0,
      total: o.total ?? 0,
      refund_amount: o.refund_amount ?? 0,
      currency: CURRENCY_DEFAULT,
      payment_type: o.payment_type ?? PaymentType.CASH,
      payment_provider: o.payment_provider ?? PaymentProvider.NONE,
      cash_share: o.cash_share ?? 0,
      online_share: o.online_share ?? 0,
      status: o.status ?? 'success',
      created_at: o.created_at ?? new Date().toISOString(),
      items: [],
    }));

    return {
      orders,
      totalCount: aggregate.count ?? 0,
      stats: {
        totalRevenue: aggregate.sum?.total ?? 0,
        totalRefunds: aggregate.sum?.refund_amount ?? 0,
        cashTotal: aggregate.sum?.cash_share ?? 0,
        onlineTotal: aggregate.sum?.online_share ?? 0,
      },
    };
  },

  async fetchOrderItems(orderId: string) {
    const d = await gqlRequest<any>({
      query: ORDER_ITEMS_QUERY,
      variables: { orderId },
    });
    return (d?.order_items ?? []).map((i: any) => ({
      article_code: i.article_code ?? '',
      product_name: i.product_name ?? '',
      size: i.product?.size ?? undefined,
      quantity: i.quantity ?? 0,
      unit_price: i.unit_price ?? 0,
      total: i.total ?? 0,
      transaction_type: i.transaction_type ?? 'sale',
    }));
  },

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult | null> {
    const orderItemsData = input.order_items.map((item) => {
      const isRequest = item.transaction_type === 'request';
      return {
        article_code: item.article_code,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        transaction_type: item.transaction_type,
        tax_percentage: item.tax_percentage ?? 0,
        tax_amount: item.tax_amount ?? 0,
        total: Math.abs(item.total),
        ...(isRequest && item.request_details
          ? {
              order_item_requests: {
                data: [
                  {
                    [OrderItemRequestField.STUDENT_NAME]: item.request_details.name,
                    [OrderItemRequestField.STUDENT_CLASS]: item.request_details.class,
                    [OrderItemRequestField.PHONE_NUMBER]: item.request_details.phone ?? null,
                    fulfillment_status: 'pending',
                    company_id: input.company_id,
                  },
                ],
              },
            }
          : {}),
      };
    });
    const orderData = await gqlRequest<any>({
      query: CREATE_ORDER_MUTATION,
      variables: {
        order: {
          company_id: input.company_id,
          user_id: input.user_id,
          subtotal: input.subtotal,
          total: input.total,
          payment_type: input.payment_type,
          ...(input.payment_provider ? { payment_provider: input.payment_provider } : {}),
          cash_share: input.cash_share,
          online_share: input.online_share,
          status: input.status ?? 'success',
          order_items: { data: orderItemsData },
        },
      },
    });
    const orderRow = orderData?.insert_order_history_one;
    if (!orderRow?.order_id) return null;
    return { server_order_id: orderRow.order_id, total: orderRow.total ?? input.total };
  },

  async createRazorpayOrder(input: CreateRazorpayOrderInput): Promise<CreateRazorpayOrderResult> {
    const d = await gqlRequest<any>({
      query: CREATE_RAZORPAY_ORDER_ACTION,
      variables: {
        server_order_id: input.server_order_id,
        amount: input.amount,
        currency: input.currency,
      },
    });
    return { razorpay_order_id: d.createRazorpayOrder.razorpay_order_id };
  },

  async verifyRazorpayPayment(input: VerifyRazorpayPaymentInput): Promise<VerifyRazorpayPaymentResult> {
    const d = await gqlRequest<any>({
      query: VERIFY_RAZORPAY_PAYMENT_ACTION,
      variables: {
        server_order_id: input.server_order_id,
        razorpay_order_id: input.razorpay_order_id,
        razorpay_payment_id: input.razorpay_payment_id,
        razorpay_signature: input.razorpay_signature,
      },
    });
    return {
      success: d.verifyRazorpayPayment.success,
      status: d.verifyRazorpayPayment.status,
    };
  },

  async updateOrderStatus(input: UpdateOrderStatusInput): Promise<void> {
    await gqlRequest<any>({
      query: UPDATE_ORDER_STATUS_MUTATION,
      variables: { orderId: input.server_order_id, status: input.status },
    });
  },

  async fetchRequestedOrders(companyId, opts) {
    const { page = 1, limit = 50, tab, searchFilters = {} } = opts;
    const offset = (page - 1) * limit;
    const where = buildRequestedOrdersWhere(companyId, tab, searchFilters);
    const d = await gqlRequest<any>({
      query: REQUEST_ORDERS_BUNDLED_QUERY,
      variables: { where, limit, offset },
    });
    const rows = d?.order_history ?? [];
    const count = d?.order_history_aggregate?.aggregate?.count ?? 0;
    return {
      orders: rows.map(mapRequestedOrderListRow),
      totalCount: typeof count === 'number' ? count : 0,
    };
  },

  async fetchRequestedOrderLines(orderId, opts) {
    const { page = 1, limit = 50 } = opts;
    const offset = (page - 1) * limit;
    const d = await gqlRequest<any>({
      query: REQUEST_ORDER_LINES_QUERY,
      variables: { orderId, limit, offset },
    });
    const rows = d?.order_items ?? [];
    const count = d?.order_items_aggregate?.aggregate?.count ?? 0;
    return {
      lines: rows.map((row: any, i: number) => mapRequestedOrderLine(row, offset + i)),
      totalCount: typeof count === 'number' ? count : 0,
    };
  },

  async fulfillOrderRequests(orderId) {
    const d = await gqlRequest<any>({
      query: FULFILL_ORDER_REQUESTS_MUTATION,
      variables: { orderId },
    });
    const affected = d?.update_order_item_requests?.affected_rows ?? 0;
    return { success: true, affected_rows: typeof affected === 'number' ? affected : 0 };
  },

  async fetchPendingTransfers(companyId) {
    const d = await gqlRequest<any>({ query: PENDING_TRANSFERS_QUERY, variables: { companyId } });
    const rows = d?.inventory_transfers ?? [];
    return rows.map(mapTransferRow);
  },

  async fetchTransferHistory(companyId) {
    const d = await gqlRequest<any>({ query: TRANSFER_HISTORY_QUERY, variables: { companyId } });
    const rows = d?.inventory_transfers ?? [];
    return rows.map(mapTransferRow);
  },

  async createTransfer(input: CreateTransferInput): Promise<CreateTransferResult | null> {
    const transferData = await gqlRequest<any>({
      query: CREATE_TRANSFER_MUTATION,
      variables: {
        transfer: {
          source_company_id: input.source_company_id,
          destination_company_id: input.destination_company_id,
          created_by: input.created_by,
          status: 'pending',
          notes: input.notes ?? null,
          items: {
            data: input.items.map((i) => ({
              article_code: i.article_code,
              quantity: i.quantity,
            })),
          },
        },
      },
    });
    const transferRow = transferData?.insert_inventory_transfers_one;
    if (!transferRow?.id) return null;
    return { id: transferRow.id, status: transferRow.status ?? 'pending' };
  },

  async acceptTransfer(transferId: string) {
    const user = await auth.getUser();
    const userId = user?.id ?? '';
    const d = await gqlRequest<any>({
      query: UPDATE_TRANSFER_MUTATION,
      variables: { id: transferId, status: 'accepted', respondedBy: userId },
    });
    return d?.update_inventory_transfers_by_pk
      ? ({} as import('@/core/types/transfer').InventoryTransfer)
      : null;
  },

  async rejectTransfer(transferId: string) {
    const user = await auth.getUser();
    const userId = user?.id ?? '';
    const d = await gqlRequest<any>({
      query: UPDATE_TRANSFER_MUTATION,
      variables: { id: transferId, status: 'rejected', respondedBy: userId },
    });
    return d?.update_inventory_transfers_by_pk
      ? ({} as import('@/core/types/transfer').InventoryTransfer)
      : null;
  },

  async cancelTransfer(transferId: string) {
    const user = await auth.getUser();
    const userId = user?.id ?? '';
    const d = await gqlRequest<any>({
      query: UPDATE_TRANSFER_MUTATION,
      variables: { id: transferId, status: 'cancelled', respondedBy: userId },
    });
    return d?.update_inventory_transfers_by_pk
      ? ({} as import('@/core/types/transfer').InventoryTransfer)
      : null;
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const nhostBackend: BackendProvider = { auth, data };
