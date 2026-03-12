import React, { createContext, useCallback, useContext, useState } from 'react';

type DataSourceContextType = {
  useMockData: boolean;
  toggleDataSource: () => void;
};

const DataSourceContext = createContext<DataSourceContextType | undefined>(undefined);

export function DataSourceProvider({ children }: { children: React.ReactNode }) {
  const [useMockData, setUseMockData] = useState(false);

  const toggleDataSource = useCallback(() => {
    setUseMockData((prev) => !prev);
  }, []);

  return (
    <DataSourceContext.Provider value={{ useMockData, toggleDataSource }}>
      {children}
    </DataSourceContext.Provider>
  );
}

export function useDataSource() {
  const context = useContext(DataSourceContext);
  if (!context) {
    throw new Error('useDataSource must be used within a DataSourceProvider');
  }
  return context;
}
