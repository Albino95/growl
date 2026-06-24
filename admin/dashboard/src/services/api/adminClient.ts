const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787/api/v1';

export function getApiBaseUrl(): string {
  return BASE_URL;
}

/** True when admin UI talks to localhost (local D1 / demo seeds only). */
export function isLocalApi(): boolean {
  try {
    const host = new URL(BASE_URL).hostname;
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return BASE_URL.includes('localhost');
  }
}

export function getApiDisplayHost(): string {
  try {
    return new URL(BASE_URL).host;
  } catch {
    return BASE_URL;
  }
}

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
};

export class AdminApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'AdminApiError';
    this.code = code;
    this.status = status;
  }
}

function getToken(): string | null {
  return localStorage.getItem('admin_token');
}

export function setAdminToken(token: string | null) {
  if (token) localStorage.setItem('admin_token', token);
  else localStorage.removeItem('admin_token');
}

export async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const data = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !data.success) {
    throw new AdminApiError(
      data.error?.code || 'REQUEST_FAILED',
      data.error?.message || `Request failed (${res.status})`,
      res.status
    );
  }
  return data.data as T;
}

export type AdminLoginResponse = {
  token: string;
  admin: { id: string; email: string; role: string; mfa_enabled: boolean };
  permissions: string[];
};

export async function adminLogin(email: string, password: string, totp?: string) {
  const res = await fetch(`${BASE_URL}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, totp }),
  });
  const data = (await res.json()) as ApiResponse<AdminLoginResponse>;
  if (!res.ok || !data.success) {
    throw new AdminApiError(
      data.error?.code || 'LOGIN_FAILED',
      data.error?.message || 'Login failed',
      res.status
    );
  }
  return data.data as AdminLoginResponse;
}

export function adminMe() {
  return adminRequest<{ admin: { id: string; email: string; role: string }; permissions: string[] }>(
    '/admin/auth/me'
  );
}

export function adminLogout() {
  return adminRequest<{ ok: boolean }>('/admin/auth/logout', { method: 'POST' });
}

export function updateUserRoles(userId: string, roles: { is_instructor?: boolean; is_business?: boolean }) {
  return adminRequest<{ ok: boolean }>(`/admin/users/${userId}/roles`, {
    method: 'PATCH',
    body: JSON.stringify(roles),
  });
}

export function exportUserData(userId: string) {
  return adminRequest<Record<string, unknown>>(`/admin/privacy/users/${userId}/export`, {
    method: 'POST',
    body: '{}',
  });
}

export function createPrivacyRequest(userId: string, requestType: 'export' | 'delete') {
  return adminRequest<{ id: string }>('/admin/privacy/requests', {
    method: 'POST',
    body: JSON.stringify({ userId, requestType }),
  });
}

export function getBusinessOrder(orderId: string) {
  return adminRequest<Record<string, unknown>>(`/admin/business/orders/${orderId}`);
}

export type BusinessAccount = {
  id: string;
  email: string;
  is_business: number;
  created_at: string;
  display_name: string;
  contact_email: string;
  field_of_operation: string;
  verification_status: string;
  profile_created_at: string;
};

export type CreateBusinessAccountResponse = {
  userId: string;
  email: string;
  temporaryPassword: string;
};

export function listBusinessAccounts() {
  return adminRequest<{ accounts: BusinessAccount[]; fields: string[] }>('/admin/business/accounts');
}

export function createBusinessAccount(payload: {
  email: string;
  temporaryPassword: string;
  displayName: string;
  contactEmail: string;
  contactPhone?: string;
  fieldOfOperation: string;
  vatNumber?: string;
  countryCode?: string;
  addressLine?: string;
  notes?: string;
}) {
  return adminRequest<CreateBusinessAccountResponse>('/admin/business/accounts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getBusinessAccount(userId: string) {
  return adminRequest<{ user: Record<string, unknown>; profile: Record<string, unknown> }>(
    `/admin/business/accounts/${userId}`
  );
}

export function updateBusinessAccount(
  userId: string,
  payload: {
    displayName?: string;
    contactEmail?: string;
    contactPhone?: string;
    fieldOfOperation?: string;
    vatNumber?: string;
    countryCode?: string;
    addressLine?: string;
    verificationStatus?: 'pending' | 'verified' | 'rejected';
    notes?: string;
    deactivate?: boolean;
  }
) {
  return adminRequest<{ ok: boolean }>(`/admin/business/accounts/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
