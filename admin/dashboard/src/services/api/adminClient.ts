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

/** Fired when the API answers 403 MFA_ENROLL_REQUIRED (AdminAuthProvider listens). */
export const MFA_REQUIRED_EVENT = 'admin:mfa-enroll-required';

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
  let data: ApiResponse<T>;
  try {
    data = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new AdminApiError('BAD_RESPONSE', `Request failed (${res.status})`, res.status);
  }
  if (!res.ok || !data.success) {
    if (data.error?.code === 'MFA_ENROLL_REQUIRED' && typeof window !== 'undefined') {
      // The server only accepts this session for MFA setup: send the admin there.
      window.dispatchEvent(new CustomEvent(MFA_REQUIRED_EVENT));
    }
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
  must_enroll_mfa?: boolean;
};

export async function adminLogin(
  email: string,
  password: string,
  totp?: string,
  recoveryCode?: string
) {
  const res = await fetch(`${BASE_URL}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, totp, recoveryCode }),
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

export type AdminMeResponse = {
  admin: { id: string; email: string; role: string; mfa_enabled?: boolean };
  permissions: string[];
  mfa_enabled: boolean;
  mfa_required: boolean;
  must_enroll_mfa: boolean;
};

export function adminMe() {
  return adminRequest<AdminMeResponse>('/admin/auth/me');
}

/** Paged list envelope returned by the admin list endpoints. */
export type Paged = { total: number; limit: number; offset: number; has_more: boolean };

export function listQuery(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const q = sp.toString();
  return q ? `?${q}` : '';
}

/** Random key so a retried refund is applied once. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** Save JSON as a file. The link must be in the DOM for Firefox; revoke after the click lands. */
export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 0);
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

export function listBusinessAccounts(params: { q?: string; status?: string; limit?: number; offset?: number } = {}) {
  return adminRequest<{ accounts: BusinessAccount[]; fields: string[] } & Paged>(
    `/admin/business/accounts${listQuery(params)}`
  );
}

export type RefundResult = {
  ok: boolean;
  refund_amount: number;
  total_refunded: number;
  remaining: number;
  payment_status: string;
  status: string;
  restocked: boolean;
  replayed?: boolean;
};

export function refundOrder(orderId: string, body: { amount?: number; reasonText: string }, idempotencyKey: string) {
  return adminRequest<RefundResult>(`/admin/business/orders/${orderId}/refund`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  });
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
