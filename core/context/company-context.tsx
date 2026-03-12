import React, { createContext, useCallback, useContext, useState } from 'react';
import type { CompanyWithRole } from '@/core/types/company';

type CompanyContextType = {
  selectedCompany: CompanyWithRole | null;
  setSelectedCompany: (company: CompanyWithRole | null) => void;
};

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [selectedCompany, setSelected] = useState<CompanyWithRole | null>(null);

  const setSelectedCompany = useCallback((company: CompanyWithRole | null) => {
    setSelected(company);
  }, []);

  return (
    <CompanyContext.Provider value={{ selectedCompany, setSelectedCompany }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (!context) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
}
