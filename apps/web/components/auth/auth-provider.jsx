'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, logout } from '@/lib/auth/client';
import { localizedPath } from '@/lib/i18n';

const AuthContext = createContext(null);

export function AuthProvider({ locale = 'en', children }) {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState('loading');
  const [pendingVerification, setPendingVerification] = useState(null);

  const refreshSession = useCallback(async () => {
    try {
      const next = await getSession();
      setSession(next);
      setStatus(next?.authenticated ? 'authenticated' : 'unauthenticated');
      return next;
    } catch {
      setSession(null);
      setStatus('unauthenticated');
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    getSession()
      .then((next) => {
        if (!active) return;
        setSession(next);
        setStatus(next?.authenticated ? 'authenticated' : 'unauthenticated');
      })
      .catch(() => {
        if (!active) return;
        setSession(null);
        setStatus('unauthenticated');
      });

    return () => {
      active = false;
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logout();
    } finally {
      setSession(null);
      setStatus('unauthenticated');
      setPendingVerification(null);
      router.push(localizedPath(locale, '/login'));
      router.refresh();
    }
  }, [locale, router]);

  const value = useMemo(
    () => ({
      session,
      status,
      isAuthenticated: status === 'authenticated',
      refreshSession,
      signOut,
      pendingVerification,
      setPendingVerification,
      clearPendingVerification: () => setPendingVerification(null),
    }),
    [session, status, refreshSession, signOut, pendingVerification],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}
