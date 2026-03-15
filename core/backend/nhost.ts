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
import { toast } from '@/core/services/toast';
import { PaymentProvider, PaymentType } from '@/core/types/order';
import type { Product } from '@/core/types/product';
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
  UpdateOrderStatusInput,
  VerifyRazorpayPaymentInput,
  VerifyRazorpayPaymentResult,
} from './types';

const SESSION_KEY = DEFAULT_SESSION_KEY;
const SECURE_STORE_MAX_BYTES = 2048;

// ---------------------------------------------------------------------------
// Secure session storage: SecureStore on native (when payload fits), else AsyncStorage.
// Exposes hydrationPromise so the app can wait for restore before reading session.
// ---------------------------------------------------------------------------

class SecureSessionStorage implements SessionStorageBackend {
  private cache: Session | null = null;
  readonly hydrationPromise: Promise<void>;

  constructor() {
    this.hydrationPromise = this.hydrate();
  }

  private async hydrate(): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        const raw = await AsyncStorage.getItem(SESSION_KEY);
        if (raw) {
          try {
            this.cache = JSON.parse(raw) as Session;
          } catch {
            this.cache = null;
          }
        }
        return;
      }
      const fromSecure = await SecureStore.getItemAsync(SESSION_KEY);
      if (fromSecure) {
        try {
          this.cache = JSON.parse(fromSecure) as Session;
        } catch {
          this.cache = null;
        }
      }
      if (this.cache === null) {
        const fromAsync = await AsyncStorage.getItem(SESSION_KEY);
        if (fromAsync) {
          try {
            this.cache = JSON.parse(fromAsync) as Session;
          } catch {
            this.cache = null;
          }
        }
      }
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
      void AsyncStorage.setItem(SESSION_KEY, raw).catch(() => {});
      return;
    }
    if (raw.length <= SECURE_STORE_MAX_BYTES) {
      void SecureStore.setItemAsync(SESSION_KEY, raw).catch(() => {
        void AsyncStorage.setItem(SESSION_KEY, raw).catch(() => {});
      });
    } else {
      void AsyncStorage.setItem(SESSION_KEY, raw).catch(() => {});
    }
  }

  remove(): void {
    this.cache = null;
    if (Platform.OS !== 'web') {
      void SecureStore.deleteItemAsync(SESSION_KEY).catch(() => {});
    }
    void AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
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
    await nhost.auth.signOut();
  },

  async getSession() {
    await sessionStorageBackend.hydrationPromise;
    return toAppSession(nhost.getUserSession());
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
    payment_type
    payment_provider
    cash_share
    online_share
    created_at
    status
    subtotal
    order_items {
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
}`;


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




function mapProductInventoryRow(row: any): Product {
  const reserved = row.reserved ?? 0;
  const product = row.product ?? {};
  const name = product.name ?? '';
  const size = product.size ? ` (${product.size})` : '';
  return {
    article_code: product.article_code,
    company_id: row.company_id,
    name: `${name}${size}`.trim() || product.article_code,
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
      const tiles = row.access_role?.visible_tiles ?? ['inventory', 'sale_history', 'new_sale'];
      return {
        id: company.id,
        name: company.name,
        slug: company.slug ?? undefined,
        address: company.address ?? undefined,
        razorpay_id: company.razorpay_id ?? undefined, // Add razorpay_id to company table and to query above to enable "Online (via PG)"
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

  async fetchOrders(companyId, _opts) {
    const d = await gqlRequest<any>({ query: ORDERS_QUERY, variables: { companyId } });
    const rows = d?.order_history ?? [];
    return rows.map((o: any) => {
      return {
        server_order_id: o.order_id,
        company_id: o.company_id ?? companyId,
        subtotal: o.subtotal ?? o.total ?? 0,
        total: o.total ?? 0,
        currency: CURRENCY_DEFAULT,
        payment_type: o.payment_type ?? PaymentType.CASH,
        payment_provider: o.payment_provider ?? PaymentProvider.NONE,
        cash_share: o.cash_share ?? 0,
        online_share: o.online_share ?? 0,
        status: o.status ?? 'success',
        created_at: o.created_at ?? new Date().toISOString(),
        items: (o.order_items ?? []).map((i: any) => ({
          article_code: i.article_code ?? '',
          product_name: i.product_name ?? '',
          size: i.size ?? undefined,
          quantity: i.quantity ?? 0,
          unit_price: i.unit_price ?? 0,
          total: i.total ?? 0,
          transaction_type: i.transaction_type ?? 'sale',
        })),
      };
    });
  },

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult | null> {
    const orderItemsData = input.order_items.map((item) => ({
      article_code: item.article_code,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      transaction_type: item.transaction_type,
      tax_percentage: item.tax_percentage ?? 0,
      tax_amount: item.tax_amount ?? 0,
      total: Math.abs(item.total),
    }));
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
