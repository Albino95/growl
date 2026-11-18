import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  adminLogin,
  adminLogout,
  adminMe,
  setAdminToken,
  MFA_REQUIRED_EVENT,
  AdminApiError,
} from '../services/api/adminClient';

type AdminIdentity = { id: string; email: string; role: string; mfa_enabled?: boolean };

type AdminAuthState = {
  loading: boolean;
  admin: AdminIdentity | null;
  permissions: string[];
  /** True while the server only accepts this session for MFA setup. */
  mustEnrollMfa: boolean;
  mfaEnabled: boolean;
  /** Swap in the full session the server returns after MFA is enabled. */
  completeMfaEnrollment: (session: { token: string; admin: AdminIdentity; permissions: string[] }) => void;
  can: (permission: string) => boolean;
  login: (email: string, password: string, totp?: string, recoveryCode?: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AdminAuthContext = createContext<AdminAuthState | null>(null);

export function hasPerm(permissions: string[], permission: string): boolean {
  return permissions.includes('*') || permissions.includes(permission);
}

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [mustEnrollMfa, setMustEnrollMfa] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await adminMe();
      setAdmin(res.admin);
      setPermissions(res.permissions || []);
      // Server decides: a restricted session (or MFA required but missing) goes to setup, also after reload.
      setMustEnrollMfa(!!res.must_enroll_mfa);
      setMfaEnabled(!!res.mfa_enabled);
    } catch (err) {
      // Only a rejected session signs out; a network blip keeps the stored token.
      if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
        setAdminToken(null);
      }
      setAdmin(null);
      setPermissions([]);
      setMustEnrollMfa(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onRequired = () => {
      setMustEnrollMfa(true);
      setPermissions([]);
    };
    window.addEventListener(MFA_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(MFA_REQUIRED_EVENT, onRequired);
  }, []);

  const login = useCallback(async (email: string, password: string, totp?: string, recoveryCode?: string) => {
    const res = await adminLogin(email, password, totp, recoveryCode);
    setAdminToken(res.token);
    setAdmin(res.admin);
    setPermissions(res.permissions || []);
    setMustEnrollMfa(!!res.must_enroll_mfa);
    setMfaEnabled(!!res.admin?.mfa_enabled);
  }, []);

  const logout = useCallback(async () => {
    try {
      await adminLogout();
    } finally {
      setAdminToken(null);
      setAdmin(null);
      setPermissions([]);
      setMustEnrollMfa(false);
      setMfaEnabled(false);
    }
  }, []);

  const completeMfaEnrollment = useCallback(
    (session: { token: string; admin: AdminIdentity; permissions: string[] }) => {
      if (session.token) setAdminToken(session.token);
      setAdmin(session.admin);
      setPermissions(session.permissions || []);
      setMustEnrollMfa(false);
      setMfaEnabled(true);
    },
    []
  );

  const can = useCallback((permission: string) => hasPerm(permissions, permission), [permissions]);

  const value = useMemo(
    () => ({ loading, admin, permissions, mustEnrollMfa, mfaEnabled, completeMfaEnrollment, can, login, logout }),
    [loading, admin, permissions, mustEnrollMfa, mfaEnabled, completeMfaEnrollment, can, login, logout]
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
