import { backend } from '@/lib/backend';
import { MOCK_COMPANIES } from '@/lib/mock-data';
import type { CompanyWithRole } from '@/types/company';

export async function fetchCompanies(useMock: boolean): Promise<CompanyWithRole[]> {
  if (useMock) return MOCK_COMPANIES;

  const user = await backend.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  return backend.data.fetchCompanies(user.id);
}
