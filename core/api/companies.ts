import { backend } from '@/core/backend';
import { getMockCompanies } from '@/core/services/mock-data';
import type { CompanyWithRole } from '@/core/types/company';
import { toast } from '@/core/services/toast';

export async function fetchCompanies(useMock: boolean): Promise<CompanyWithRole[]> {
  if (useMock) return getMockCompanies();

  const user = await backend.auth.getUser();
  if (!user) {
    toast.show({ type: 'error', message: 'Not authenticated. Please login again.' });
    throw new Error('Not authenticated');
  }

  return backend.data.fetchCompanies(user.id);
}
