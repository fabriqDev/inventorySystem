import companiesJson from '@/assets/mock/companies.json';
import productsJson from '@/assets/mock/products.json';
import ordersJson from '@/assets/mock/orders.json';
import type { CompanyWithRole } from '@/types/company';
import type { Product } from '@/types/product';
import type { Order } from '@/types/order';

const MIN_LATENCY_MS = 500;
const MAX_LATENCY_MS = 2000;

function randomDelayMs(): number {
  return Math.floor(Math.random() * (MAX_LATENCY_MS - MIN_LATENCY_MS + 1)) + MIN_LATENCY_MS;
}

function simulateNetwork<T>(data: T): Promise<T> {
  const delay = randomDelayMs();
  return new Promise((resolve) =>
    setTimeout(() => resolve(JSON.parse(JSON.stringify(data))), delay),
  );
}

export async function getMockCompanies(): Promise<CompanyWithRole[]> {
  return simulateNetwork(companiesJson as unknown as CompanyWithRole[]);
}

export async function getMockProducts(companyId: string): Promise<Product[]> {
  const map = productsJson as unknown as Record<string, Product[]>;
  return simulateNetwork(map[companyId] ?? []);
}

export async function getMockOrders(companyId: string): Promise<Order[]> {
  const map = ordersJson as unknown as Record<string, Order[]>;
  return simulateNetwork(map[companyId] ?? []);
}
