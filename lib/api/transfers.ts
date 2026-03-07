import { backend } from '@/lib/backend';
import type { CreateTransferInput, CreateTransferResult } from '@/lib/backend/types';
import {
  acceptMockTransfer,
  createMockTransfer,
  getMockPendingTransfers,
  getMockTransferHistory,
  rejectMockTransfer,
} from '@/lib/mock-data';
import type { CompanyWithRole } from '@/types/company';
import type { InventoryTransfer } from '@/types/transfer';

export async function fetchPendingTransfers(
  companyId: string,
  useMock: boolean,
): Promise<InventoryTransfer[]> {
  if (useMock) return getMockPendingTransfers(companyId);
  return backend.data.fetchPendingTransfers(companyId);
}

export async function fetchTransferHistory(
  companyId: string,
  useMock: boolean,
): Promise<InventoryTransfer[]> {
  if (useMock) return getMockTransferHistory(companyId);
  return backend.data.fetchTransferHistory(companyId);
}

export async function createTransfer(
  input: CreateTransferInput,
  useMock: boolean,
): Promise<CreateTransferResult | null> {
  if (useMock) return createMockTransfer(input);
  return backend.data.createTransfer(input);
}

export async function acceptTransfer(
  transferId: string,
  useMock: boolean,
): Promise<InventoryTransfer | null> {
  if (useMock) return acceptMockTransfer(transferId);
  return backend.data.acceptTransfer(transferId);
}

export async function rejectTransfer(
  transferId: string,
  useMock: boolean,
): Promise<InventoryTransfer | null> {
  if (useMock) return rejectMockTransfer(transferId);
  return backend.data.rejectTransfer(transferId);
}

/**
 * Returns companies the user can transfer to (all user's companies except the current one).
 * Uses fetchCompanies - filter by transfer role can be done when backend exposes it.
 */
export function fetchTransferableCompanies(
  companies: CompanyWithRole[],
  currentCompanyId: string,
): CompanyWithRole[] {
  return companies.filter((c) => c.id !== currentCompanyId);
}
