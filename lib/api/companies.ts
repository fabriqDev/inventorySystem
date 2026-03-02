import { backend } from '@/lib/backend';
import type { CompanyWithRole } from '@/types/company';

export async function fetchCompanies(useMock: boolean): Promise<CompanyWithRole[]> {
  // if (useMock) return MOCK_COMPANIES;
  const user = await backend.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  console.log("Called 1 ");

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/aa697f5a-9be3-44da-bbc8-c7a8754d1489',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'companies.ts:beforeFetch',message:'About to call backend.data.fetchCompanies',data:{userId:user.id},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  let ans: CompanyWithRole[];
  try {
    console.log("Called 11");

    ans = await backend.data.fetchCompanies(user.id);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aa697f5a-9be3-44da-bbc8-c7a8754d1489',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'companies.ts:afterFetch',message:'fetchCompanies returned',data:{count:ans?.length},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    console.log("Called 2", ans);
    return ans;
  } catch (e) {
    console.log("Called 1 2",e);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aa697f5a-9be3-44da-bbc8-c7a8754d1489',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'companies.ts:catch',message:'fetchCompanies threw',data:{error:String(e)},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    throw e;
  }
}
