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
import type {
  AppSession,
  AuthProvider,
  BackendProvider,
  CreateSaleInput,
  CreateSaleResult,
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
// GraphQL queries (Hasura)
// ---------------------------------------------------------------------------

const COMPANIES_QUERY = `
  query GetCompanies($userId: uuid!) {
    user_company_roles(
      where: { 
        user_id: { _eq: $userId }
        is_active: { _eq: true }
      }
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
`;

const PRODUCTS_QUERY = `
  query GetProducts($companyId: uuid!, $searchPattern: String!, $offset: Int!, $limit: Int!) {
    products(
      where: {
        company_id: { _eq: $companyId }
        is_active: { _eq: true }
        _or: [
          { name: { _ilike: $searchPattern } }
          { sku: { _ilike: $searchPattern } }
        ]
      }
      order_by: { name: asc }
      offset: $offset
      limit: $limit
    ) {
      id company_id name sku year color selling_price tax_percentage
      category { name }
      product_sizes(where: { is_active: { _eq: true } }) {
        id size barcode stock
      }
    }
    products_aggregate(
      where: {
        company_id: { _eq: $companyId }
        is_active: { _eq: true }
        _or: [
          { name: { _ilike: $searchPattern } }
          { sku: { _ilike: $searchPattern } }
        ]
      }
    ) {
      aggregate { count }
    }
  }
`;

const PRODUCT_BY_BARCODE_QUERY = `
  query GetProductByBarcode($companyId: uuid!, $barcode: String!) {
    product_sizes(
      where: {
        barcode: { _eq: $barcode }
        is_active: { _eq: true }
        product: { company_id: { _eq: $companyId }, is_active: { _eq: true } }
      }
      limit: 1
    ) {
      id size barcode stock
      product { id company_id name sku selling_price tax_percentage color year }
    }
  }
`;

const SALES_QUERY = `
  query GetSales($companyId: uuid!) {
    sales(
      where: { company_id: { _eq: $companyId } }
      order_by: { created_at: desc }
    ) {
      id company_id sale_number total payment_method created_at
      sale_items { product_name size quantity total }
    }
  }
`;

const CREATE_SALE_MUTATION = `
  mutation CreateSale($object: sales_insert_input!) {
    insert_sales_one(object: $object) {
      id
      sale_number
      total
    }
  }
`;

// ---------------------------------------------------------------------------
// Data adapter
// ---------------------------------------------------------------------------

const data: DataProvider = {
  async fetchCompanies(userId) {
    const res = await nhost.graphql.request({ 
      query: COMPANIES_QUERY, 
      variables: { userId } 
    });
    const d = (res.body as any).data;
  
    return (d?.user_company_roles ?? []).map((row: any) => ({
      id: row.company.id,
      name: row.company.name,
      slug: row.company.slug || undefined,
      meta: {
        address: row.company.address || undefined,
        logo_url: undefined,
      },
      created_at: row.company.created_at,
      updated_at: row.company.updated_at,
      role: row.access_role.role_name,
      visible_tiles: row.access_role.visible_tiles ||
        ['inventory', 'sale_history', 'new_sale'],
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

    const productRows = d?.products ?? [];
    const total = d?.products_aggregate?.aggregate?.count ?? 0;

    const products: Product[] = [];
    for (const p of productRows) {
      const sizes = p.product_sizes ?? [];
      for (const sz of sizes) {
        products.push({
          id: `${p.id}-${sz.id}`,
          company_id: p.company_id,
          name: `${p.name} (${sz.size})`,
          sku: p.sku,
          scan_code: sz.barcode ?? null,
          price: p.selling_price ?? 0,
          currency: '₹',
          quantity: sz.stock ?? 0,
          created_at: undefined,
        });
      }
    }

    return {
      products,
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
    const rows = d?.product_sizes ?? [];
    const first = rows[0];
    if (!first?.product) return null;

    const p = first.product;
    return {
      id: p.id,
      company_id: p.company_id,
      name: p.name,
      sku: p.sku,
      scan_code: first.barcode ?? null,
      price: p.selling_price ?? 0,
      currency: '₹',
      quantity: first.stock ?? 0,
      size_id: first.id,
      size: first.size,
    } as Product;
  },

  async fetchOrders(companyId, _opts) {
    const res = await nhost.graphql.request({
      query: SALES_QUERY,
      variables: { companyId },
    });
    const d = (res.body as any).data;
    const sales = d?.sales ?? [];
    return sales.map((s: any) => ({
      id: s.id,
      company_id: s.company_id ?? companyId,
      total_amount: s.total ?? 0,
      currency: '₹',
      status: 'success' as const,
      payment_method: s.payment_method ?? 'cash',
      created_at: s.created_at ?? new Date().toISOString(),
    }));
  },

  async createSale(input: CreateSaleInput): Promise<CreateSaleResult | null> {
    const object = {
      company_id: input.company_id,
      subtotal: input.subtotal,
      tax_amount: input.tax_amount,
      total: input.total,
      payment_method: input.payment_method,
      sale_items: {
        data: input.sale_items.map((item) => ({
          product_id: item.product_id,
          size_id: item.size_id,
          product_name: item.product_name,
          size: item.size,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_percentage: item.tax_percentage ?? 0,
          tax_amount: item.tax_amount ?? 0,
          total: item.total,
        })),
      },
    };
    const res = await nhost.graphql.request({
      query: CREATE_SALE_MUTATION,
      variables: { object },
    });
    const body = res.body as any;
    const err = body.errors?.[0];
    if (err) {
      throw new Error(err.message ?? 'Create sale failed');
    }
    const sale = body.data?.insert_sales_one ?? null;
    return sale;
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const nhostBackend: BackendProvider = { auth, data };
