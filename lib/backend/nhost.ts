import { createClient } from '@nhost/nhost-js';
import {
  DEFAULT_SESSION_KEY,
  type Session,
  type SessionStorageBackend,
} from '@nhost/nhost-js/session';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  AppSession,
  AuthProvider,
  BackendProvider,
  DataProvider,
  FetchOrdersOptions,
  FetchProductsOptions,
} from './types';

// ---------------------------------------------------------------------------
// AsyncStorage adapter -- lets NHost persist sessions across app restarts
// ---------------------------------------------------------------------------

class NhostAsyncStorage implements SessionStorageBackend {
  private key: string;
  private cache: Session | null = null;

  constructor(key: string = DEFAULT_SESSION_KEY) {
    this.key = key;
    this.hydrate();
  }

  private hydrate(): void {
    AsyncStorage.getItem(this.key)
      .then((raw) => {
        if (raw) {
          try {
            this.cache = JSON.parse(raw) as Session;
          } catch {
            this.cache = null;
          }
        }
      })
      .catch(() => {});
  }

  get(): Session | null {
    return this.cache;
  }

  set(value: Session): void {
    this.cache = value;
    void AsyncStorage.setItem(this.key, JSON.stringify(value)).catch(() => {});
  }

  remove(): void {
    this.cache = null;
    void AsyncStorage.removeItem(this.key).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// NHost client
// ---------------------------------------------------------------------------

const nhost = createClient({
  subdomain: process.env.EXPO_PUBLIC_NHOST_SUBDOMAIN ?? 'local',
  region: process.env.EXPO_PUBLIC_NHOST_REGION ?? 'local',
  storage: new NhostAsyncStorage(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toAppSession(session: Session | null | undefined): AppSession | null {
  if (!session?.user) return null;
  return {
    accessToken: session.accessToken,
    user: { id: session.user.id, email: session.user.email },
  };
}

function gqlError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error);
  return new Error(JSON.stringify(error));
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
    // Brief wait for AsyncStorage to hydrate on cold start
    await new Promise((r) => setTimeout(r, 100));
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
    return { id: session.user.id, email: session.user.email ?? undefined };
  },
};

// ---------------------------------------------------------------------------
// GraphQL queries (Hasura)
// ---------------------------------------------------------------------------

const COMPANIES_QUERY = `
  query GetCompanies($userId: uuid!) {
    user_companies(where: { user_id: { _eq: $userId } }) {
      role
      meta
      company {
        id name slug rzpay_key_id meta created_at updated_at
      }
    }
  }
`;

const PRODUCTS_QUERY = `
  query GetProducts($companyId: uuid!, $searchPattern: String!, $offset: Int!, $limit: Int!) {
    products(
      where: {
        company_id: { _eq: $companyId }
        _or: [
          { name: { _ilike: $searchPattern } }
          { sku: { _ilike: $searchPattern } }
          { barcode: { _ilike: $searchPattern } }
        ]
      }
      order_by: { name: asc }
      offset: $offset
      limit: $limit
    ) {
      id company_id name sku barcode price currency quantity image_url created_at
    }
    products_aggregate(
      where: {
        company_id: { _eq: $companyId }
        _or: [
          { name: { _ilike: $searchPattern } }
          { sku: { _ilike: $searchPattern } }
          { barcode: { _ilike: $searchPattern } }
        ]
      }
    ) {
      aggregate { count }
    }
  }
`;

const PRODUCT_BY_BARCODE_QUERY = `
  query GetProductByBarcode($companyId: uuid!, $barcode: String!) {
    products(
      where: { company_id: { _eq: $companyId }, barcode: { _eq: $barcode } }
      limit: 1
    ) {
      id company_id name sku barcode price currency quantity image_url created_at
    }
  }
`;

const ORDERS_ALL_QUERY = `
  query GetOrders($companyId: uuid!) {
    orders(
      where: { company_id: { _eq: $companyId } }
      order_by: { created_at: desc }
    ) {
      id company_id total_amount currency status payment_method
      razorpay_order_id razorpay_payment_id created_at
    }
  }
`;

const ORDERS_FILTERED_QUERY = `
  query GetOrdersFiltered($companyId: uuid!, $status: String!) {
    orders(
      where: { company_id: { _eq: $companyId }, status: { _eq: $status } }
      order_by: { created_at: desc }
    ) {
      id company_id total_amount currency status payment_method
      razorpay_order_id razorpay_payment_id created_at
    }
  }
`;

// ---------------------------------------------------------------------------
// Data adapter
// ---------------------------------------------------------------------------

const data: DataProvider = {
  async fetchCompanies(userId) {
    const res = await nhost.graphql.request({ query: COMPANIES_QUERY, variables: { userId } });
    const d = (res.body as any).data;

    return (d?.user_companies ?? []).map((row: any) => ({
      ...row.company,
      role: row.role,
      visible_tiles: row.meta?.visible_tiles ?? ['inventory', 'past_orders', 'create_order'],
    }));
  },

  async fetchProducts(companyId, { search, page = 1, limit = 40 }) {
    const offset = (page - 1) * limit;
    const searchPattern = search ? `%${search}%` : '%';

    const res = await nhost.graphql.request({
      query: PRODUCTS_QUERY,
      variables: { companyId, searchPattern, offset, limit },
    });
    const d = (res.body as any).data;

    const total = d?.products_aggregate?.aggregate?.count ?? 0;
    return {
      products: d?.products ?? [],
      total,
      has_more: offset + limit < total,
    };
  },

  async fetchProductByBarcode(companyId, barcode) {
    const res = await nhost.graphql.request({
      query: PRODUCT_BY_BARCODE_QUERY,
      variables: { companyId, barcode },
    });
    const d = (res.body as any).data;
    return d?.products?.[0] ?? null;
  },

  async fetchOrders(companyId, { status }) {
    if (status && status !== 'all') {
      const res = await nhost.graphql.request({
        query: ORDERS_FILTERED_QUERY,
        variables: { companyId, status },
      });
      const d = (res.body as any).data;
      return d?.orders ?? [];
    }

    const res = await nhost.graphql.request({
      query: ORDERS_ALL_QUERY,
      variables: { companyId },
    });
    const d = (res.body as any).data;
    return d?.orders ?? [];
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const nhostBackend: BackendProvider = { auth, data };
