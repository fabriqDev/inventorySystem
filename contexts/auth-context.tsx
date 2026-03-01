import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { backend } from '@/lib/backend';
import type { AppSession } from '@/lib/backend/types';

type AuthContextType = {
  session: AppSession | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AppSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    backend.auth.getSession().then((s) => {
      setSession(s);
      setLoading(false);
    });

    const unsubscribe = backend.auth.onAuthStateChange((s) => {
      setSession(s);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    return backend.auth.signIn(email, password);
  }, []);

  const signOut = useCallback(async () => {
    await backend.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within a SessionProvider');
  }
  return context;
}
