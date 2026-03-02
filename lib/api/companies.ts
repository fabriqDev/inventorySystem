import { backend } from '@/lib/backend';
import { getMockCompanies } from '@/lib/mock-data';
import type { CompanyWithRole } from '@/types/company';

export async function fetchCompanies(useMock: boolean): Promise<CompanyWithRole[]> {
  if (useMock) return getMockCompanies();

  const user = await backend.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  return backend.data.fetchCompanies(user.id);
}
