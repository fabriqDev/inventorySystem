import { createClient } from '@nhost/nhost-js';
import {
  DEFAULT_SESSION_KEY,
  type Session,
  type SessionStorageBackend,
} from '@nhost/nhost-js/session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { Product } from '@/types/product';
import { toBackendError, toUserMessage } from '@/lib/backend/errors';
import { toast } from '@/lib/toast';
import type {
  AppSession,
  AuthProvider,
  BackendProvider,
  CreateOrderInput,
  CreateOrderResult,
  CreateTransferInput,
  CreateTransferResult,
  DataProvider,
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

async function gqlRequest<TData>(args: { query: string; variables?: Record<string, any> }): Promise<TData> {
  try {
    const res = await nhost.graphql.request(args);
    const body = res.body as any;
    const err = body?.errors?.[0];
    if (err) {
      const message = err.message ?? 'Request failed';
      throw new Error(message);
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
    user_company_roles(where: { user_id: { _eq: $userId } }) {
      access_role { role_type }
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
`;

const PRODUCTS_QUERY = `
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
      payment_method
      transaction_type
      created_at
      status
      subtotal
      order_items {
        product_name
        quantity
        unit_price
        total
      }
    }
  }
`;

const INSERT_ORDER_HISTORY_MUTATION = `
  mutation CreateOrder($order: order_history_insert_input!) {
    insert_order_history_one(object: $order) {
      order_id
      total
    }
  }
`;

const INSERT_ORDER_ITEMS_MUTATION = `
  mutation CreateOrderItems($items: [order_items_insert_input!]!) {
    insert_order_items(objects: $items) {
      affected_rows
    }
  }
`;

const PENDING_TRANSFERS_QUERY = `
  query GetPendingTransfers($companyId: uuid!) {
    inventory_transfers(
      where: {
        destination_company_id: { _eq: $companyId }
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
      created_by_user { display_name }
      inventory_transfer_items { article_code quantity }
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
      created_by_user { display_name }
      inventory_transfer_items { article_code quantity }
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
      created_by_user { display_name }
      inventory_transfer_items { article_code quantity }
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

const ADD_TRANSFER_ITEMS_MUTATION = `
  mutation AddTransferItems($items: [inventory_transfer_items_insert_input!]!) {
    insert_inventory_transfer_items(objects: $items) {
      affected_rows
    }
  }
`;

const UPDATE_TRANSFER_MUTATION = `
  mutation UpdateTransfer($id: uuid!, $status: String!, $respondedBy: uuid!) {
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
  const reserved = row.pending_transfer_items_aggregate?.aggregate?.sum?.quantity ?? 0;
  const product = row.product ?? {};
  const name = product.name ?? '';
  const size = row.size ? ` (${row.size})` : '';
  return {
    id: row.article_code,
    company_id: undefined,
    name: `${name}${size}`.trim() || row.article_code,
    scan_code: row.article_code,
    price: row.selling_price ?? 0,
    currency: '₹',
    quantity: row.stock ?? 0,
    size: row.size ?? undefined,
    discount_percentage: row.discount_percentage ?? 0,
    tax_percentage: row.tax_percentage ?? 0,
    reserved,
    product: {
      id: product.id,
      name: product.name ?? '',
      description: product.description ?? undefined,
      color: product.color ?? '',
      uniform_type: product.uniform_type ?? '',
      year: product.year ?? null,
    },
  };
}

function mapTransferRow(row: any): import('@/types/transfer').InventoryTransfer {
  return {
    id: row.id,
    source_company_id: row.source_company_id,
    source_company_name: row.source_company?.company_name ?? '',
    destination_company_id: row.destination_company_id,
    destination_company_name: row.destination_company?.company_name ?? '',
    status: row.status,
    created_by_user_id: undefined,
    created_by_user: row.created_by_user ? { display_name: row.created_by_user.display_name } : undefined,
    responded_by_user_id: row.responded_by ?? undefined,
    notes: row.notes ?? undefined,
    items: (row.inventory_transfer_items ?? []).map((i: any) => ({
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
    const roleRows = d?.user_company_roles ?? [];
    const useAllCompanies =
      roleRows.some(
        (r: any) =>
          r.access_role?.role_type === 'super_admin' || r.access_role?.role_type === 'sub_admin',
      );
    const companies = useAllCompanies ? d?.all_companies ?? [] : d?.assigned_companies ?? [];
    const mapCompany = (row: any, roleType?: string, visibleTiles?: string[]) => {
      const company = row.company ?? row;
      const role = roleType ?? row.access_role?.role_type;
      const tiles = visibleTiles ?? row.access_role?.visible_tiles ?? ['inventory', 'sale_history', 'new_sale'];
      return {
        id: company.id,
        name: company.name,
        slug: company.slug ?? undefined,
        address: company.address ?? undefined,
        created_at: company.created_at,
        updated_at: company.updated_at,
        role,
        visible_tiles: tiles,
      };
    };
    if (useAllCompanies) {
      return companies.map((c: any) => mapCompany(c, 'super_admin', ['inventory', 'sale_history', 'new_sale', 'inventory_transfer', 'add_products']));
    }
    return companies.map((row: any) => mapCompany(row, row.access_role?.role_type, row.access_role?.visible_tiles));
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
    return rows.map((o: any) => ({
      order_id: o.order_id,
      company_id: o.company_id ?? companyId,
      transaction_type: o.transaction_type ?? 'sale',
      subtotal: o.subtotal ?? o.total ?? 0,
      total: o.total ?? 0,
      currency: '₹',
      payment_method: o.payment_method ?? 'cash',
      status: o.status ?? 'success',
      created_at: o.created_at ?? new Date().toISOString(),
      items: (o.order_items ?? []).map((i: any) => ({
        product_id: '',
        product_name: i.product_name ?? '',
        quantity: i.quantity ?? 0,
        unit_price: i.unit_price ?? 0,
        total: i.total ?? 0,
      })),
    }));
  },

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult | null> {
    const orderData = await gqlRequest<any>({
      query: INSERT_ORDER_HISTORY_MUTATION,
      variables: {
        order: {
          company_id: input.company_id,
          user_id: input.user_id,
          transaction_type: input.transaction_type,
          subtotal: input.subtotal,
          total: input.total,
          payment_method: input.payment_method,
          status: 'success',
        },
      },
    });
    const orderRow = orderData?.insert_order_history_one;
    if (!orderRow?.order_id) return null;
    const items = input.order_items.map((item) => ({
      order_id: orderRow.order_id,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      tax_percentage: item.tax_percentage ?? 0,
      tax_amount: item.tax_amount ?? 0,
      total: item.total,
    }));
    await gqlRequest<any>({ query: INSERT_ORDER_ITEMS_MUTATION, variables: { items } });
    return { order_id: orderRow.order_id, total: orderRow.total ?? input.total };
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
          status: 'pending',
          notes: input.notes ?? null,
        },
      },
    });
    const transferRow = transferData?.insert_inventory_transfers_one;
    if (!transferRow?.id) return null;
    const items = input.items.map((item) => ({
      transfer_id: transferRow.id,
      article_code: item.article_code,
      quantity: item.quantity,
    }));
    await gqlRequest<any>({ query: ADD_TRANSFER_ITEMS_MUTATION, variables: { items } });
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
      ? ({} as import('@/types/transfer').InventoryTransfer)
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
      ? ({} as import('@/types/transfer').InventoryTransfer)
      : null;
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const nhostBackend: BackendProvider = { auth, data };
