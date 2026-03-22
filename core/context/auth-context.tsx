import { DEFAULT_SESSION_KEY } from '@nhost/nhost-js/session';
import { Platform } from 'react-native';

import { backend } from '@/core/backend';
import type { AppSession } from '@/core/backend/types';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

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

  // Web: same-origin tabs share localStorage. The `storage` event fires in *other* tabs when
  // one tab signs in/out or refreshes the session — keep this tab’s session in sync.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== DEFAULT_SESSION_KEY) return;
      void backend.auth.syncSessionFromBrowserStorage().then((s) => {
        setSession(s);
        setLoading(false);
      });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
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
