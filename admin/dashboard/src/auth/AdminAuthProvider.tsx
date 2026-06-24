import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { adminLogin, adminLogout, adminMe, setAdminToken } from '../services/api/adminClient';

type AdminAuthState = {
  loading: boolean;
  admin: { id: string; email: string; role: string } | null;
  permissions: string[];
  login: (email: string, password: string, totp?: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AdminAuthContext = createContext<AdminAuthState | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState<AdminAuthState['admin']>(null);
  const [permissions, setPermissions] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await adminMe();
      setAdmin(res.admin);
      setPermissions(res.permissions || []);
    } catch {
      setAdmin(null);
      setPermissions([]);
      setAdminToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string, totp?: string) => {
    const res = await adminLogin(email, password, totp);
    setAdminToken(res.token);
    setAdmin(res.admin);
    setPermissions(res.permissions || []);
  }, []);

  const logout = useCallback(async () => {
    try {
      await adminLogout();
    } finally {
      setAdminToken(null);
      setAdmin(null);
      setPermissions([]);
    }
  }, []);

  const value = useMemo(
    () => ({ loading, admin, permissions, login, logout }),
    [loading, admin, permissions, login, logout]
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
