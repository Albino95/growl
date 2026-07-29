import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  getSellerRefreshToken,
  getSellerToken,
  sellerRefresh,
  sellerSignIn,
  sellerSignOut,
  setSellerTokens,
} from '../services/api/sellerClient';

type SellerUser = {
  userId: string;
  email: string;
};

type SellerAuthState = {
  loading: boolean;
  seller: SellerUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const SellerAuthContext = createContext<SellerAuthState | null>(null);

export function SellerAuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [seller, setSeller] = useState<SellerUser | null>(null);

  const refresh = useCallback(async () => {
    const token = getSellerToken();
    const refreshToken = getSellerRefreshToken();
    if (!token && !refreshToken) {
      setSeller(null);
      setLoading(false);
      return;
    }
    try {
      if (refreshToken) {
        const session = await sellerRefresh(refreshToken);
        if (!session.isBusiness) {
          setSellerTokens(null, null);
          setSeller(null);
          return;
        }
        setSellerTokens(session.token, session.refreshToken || refreshToken);
        setSeller({ userId: session.userId, email: session.email || '' });
      } else {
        // Token without refresh — keep optimistic session until first API 401
        setSeller({ userId: 'unknown', email: '' });
      }
    } catch {
      setSellerTokens(null, null);
      setSeller(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const session = await sellerSignIn(email, password);
    setSellerTokens(session.token, session.refreshToken || null);
    setSeller({ userId: session.userId, email: session.email || email });
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = getSellerRefreshToken();
    try {
      await sellerSignOut(refreshToken);
    } finally {
      setSellerTokens(null, null);
      setSeller(null);
    }
  }, []);

  const value = useMemo(
    () => ({ loading, seller, login, logout }),
    [loading, seller, login, logout]
  );

  return <SellerAuthContext.Provider value={value}>{children}</SellerAuthContext.Provider>;
}

export function useSellerAuth() {
  const ctx = useContext(SellerAuthContext);
  if (!ctx) throw new Error('useSellerAuth must be used within SellerAuthProvider');
  return ctx;
}
