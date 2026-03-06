import companiesJson from '@/assets/mock/companies.json';
import productsJson from '@/assets/mock/products.json';
import ordersJson from '@/assets/mock/orders.json';
import type { CompanyWithRole } from '@/types/company';
import type { Product } from '@/types/product';
import type { OrderWithItems } from '@/types/order';
import type { InventoryTransfer, TransferItem } from '@/types/transfer';
import type { CreateOrderInput, CreateOrderResult } from '@/lib/backend/types';
import type { CreateTransferInput } from '@/lib/backend/types';

const MIN_LATENCY_MS = 300;
const MAX_LATENCY_MS = 800;

function randomDelayMs(): number {
  return Math.floor(Math.random() * (MAX_LATENCY_MS - MIN_LATENCY_MS + 1)) + MIN_LATENCY_MS;
}

function simulateNetwork<T>(data: T): Promise<T> {
  const delay = randomDelayMs();
  return new Promise((resolve) =>
    setTimeout(() => resolve(JSON.parse(JSON.stringify(data))), delay),
  );
}

const mockCompanies = companiesJson as unknown as { id: string; name: string }[];

function getCompanyName(companyId: string): string {
  return mockCompanies.find((c) => c.id === companyId)?.name ?? `Company ${companyId}`;
}

// ---------------------------------------------------------------------------
// Mock inventory transfers (in-memory store)
// ---------------------------------------------------------------------------

function makeTransfer(
  id: string,
  sourceId: string,
  destId: string,
  status: InventoryTransfer['status'],
  items: TransferItem[],
  createdDaysAgo = 0,
): InventoryTransfer {
  const created = new Date();
  created.setDate(created.getDate() - createdDaysAgo);
  const updated = new Date(created);
  if (status !== 'pending') updated.setMinutes(updated.getMinutes() + 5);
  return {
    id,
    source_company_id: sourceId,
    source_company_name: getCompanyName(sourceId),
    destination_company_id: destId,
    destination_company_name: getCompanyName(destId),
    status,
    created_by_user_id: 'mock-user-1',
    items,
    created_at: created.toISOString(),
    updated_at: updated.toISOString(),
  };
}

const MOCK_TRANSFER_ITEMS: TransferItem[] = [
  { article_code: 'p1-01', quantity: 10, product_name: 'Shirt White - 2025' },
  { article_code: 'p1-02', quantity: 5, product_name: 'T-shirt Sport - 2025' },
];
const MOCK_TRANSFER_ITEMS_2: TransferItem[] = [
  { article_code: 'p2-01', quantity: 8, product_name: 'Shirt White - 2025' },
];
const MOCK_TRANSFER_ITEMS_3: TransferItem[] = [
  { article_code: 'p1-03', quantity: 3, product_name: 'Skirt Standard - 2025' },
  { article_code: 'p1-08', quantity: 20, product_name: 'Green House H/S Tshirt - 2025' },
];
const MOCK_TRANSFER_ITEMS_4: TransferItem[] = [
  { article_code: 'p3-01', quantity: 15, product_name: 'Shirt White - 2025' },
];
const MOCK_TRANSFER_ITEMS_5: TransferItem[] = [
  { article_code: 'p4-01', quantity: 5, product_name: 'Shirt White - 2025' },
];

const mockTransfersStore: InventoryTransfer[] = [
  makeTransfer('tf-p1', '1', '2', 'pending', [...MOCK_TRANSFER_ITEMS]),
  makeTransfer('tf-p2', '2', '3', 'pending', [...MOCK_TRANSFER_ITEMS_2]),
  makeTransfer('tf-h1', '1', '2', 'accepted', [...MOCK_TRANSFER_ITEMS_3], 7),
  makeTransfer('tf-h2', '3', '4', 'rejected', [...MOCK_TRANSFER_ITEMS_4], 14),
  makeTransfer('tf-h3', '4', '1', 'accepted', [...MOCK_TRANSFER_ITEMS_5], 3),
];

let mockTransferIdCounter = 100;

export async function getMockCompanies(): Promise<CompanyWithRole[]> {
  const list = companiesJson as unknown as CompanyWithRole[];
  return simulateNetwork(list);
}

export async function getMockProducts(companyId: string): Promise<Product[]> {
  const map = productsJson as unknown as Record<string, Product[]>;
  const raw = map[companyId] ?? [];
  const products: Product[] = raw.map((p) => ({
    ...p,
    id: p.id,
    price: p.price,
    quantity: p.quantity ?? 0,
    discount_percentage: p.discount_percentage ?? 0,
    tax_percentage: p.tax_percentage ?? 5,
    reserved: p.reserved ?? 0,
  }));
  return simulateNetwork(products);
}

export async function getMockOrders(companyId: string): Promise<OrderWithItems[]> {
  const map = ordersJson as unknown as Record<string, OrderWithItems[]>;
  const list = map[companyId] ?? [];
  const sorted = [...list].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return simulateNetwork(sorted);
}

let mockOrderIdCounter = 0;

export async function createMockOrder(input: CreateOrderInput): Promise<CreateOrderResult | null> {
  await simulateNetwork(null);
  mockOrderIdCounter += 1;
  return {
    order_id: `mock-order-${mockOrderIdCounter}`,
    total: input.total,
  };
}

export async function getMockPendingTransfers(companyId: string): Promise<InventoryTransfer[]> {
  const list = mockTransfersStore.filter(
    (t) => t.destination_company_id === companyId && t.status === 'pending',
  );
  return simulateNetwork([...list]);
}

export async function getMockTransferHistory(companyId: string): Promise<InventoryTransfer[]> {
  const list = mockTransfersStore.filter(
    (t) =>
      (t.source_company_id === companyId || t.destination_company_id === companyId) &&
      (t.status === 'accepted' || t.status === 'rejected'),
  );
  return simulateNetwork(
    [...list].sort(
      (a, b) =>
        new Date(b.updated_at ?? b.created_at).getTime() -
        new Date(a.updated_at ?? a.created_at).getTime(),
    ),
  );
}

export async function createMockTransfer(input: CreateTransferInput): Promise<{
  id: string;
  status: string;
}> {
  await simulateNetwork(null);
  const id = `mock-tf-${++mockTransferIdCounter}`;
  const items: TransferItem[] = input.items.map((item) => ({
    article_code: item.article_code,
    quantity: item.quantity,
  }));
  const transfer = makeTransfer(
    id,
    input.source_company_id,
    input.destination_company_id,
    'pending',
    items,
  );
  mockTransfersStore.push(transfer);
  return { id, status: transfer.status };
}

export async function acceptMockTransfer(transferId: string): Promise<InventoryTransfer | null> {
  await simulateNetwork(null);
  const t = mockTransfersStore.find((x) => x.id === transferId);
  if (!t || t.status !== 'pending') return null;
  t.status = 'accepted';
  t.updated_at = new Date().toISOString();
  t.responded_by_user_id = 'mock-user-1';
  return JSON.parse(JSON.stringify(t));
}

export async function rejectMockTransfer(transferId: string): Promise<InventoryTransfer | null> {
  await simulateNetwork(null);
  const t = mockTransfersStore.find((x) => x.id === transferId);
  if (!t || t.status !== 'pending') return null;
  t.status = 'rejected';
  t.updated_at = new Date().toISOString();
  t.responded_by_user_id = 'mock-user-1';
  return JSON.parse(JSON.stringify(t));
}
