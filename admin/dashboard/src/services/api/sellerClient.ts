const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787/api/v1';

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
};

export class SellerApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'SellerApiError';
    this.code = code;
    this.status = status;
  }
}

const TOKEN_KEY = 'seller_token';
const REFRESH_KEY = 'seller_refresh_token';

export function getSellerToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSellerTokens(token: string | null, refreshToken?: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  if (refreshToken === undefined) return;
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  else localStorage.removeItem(REFRESH_KEY);
}

export function getSellerRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export type SellerSession = {
  token: string;
  refreshToken?: string;
  expiresIn?: number;
  userId: string;
  email?: string;
  isInstructor: boolean;
  isBusiness?: boolean;
  hasCompletedOnboarding: boolean;
  categories?: string[];
};

export async function sellerSignIn(email: string, password: string): Promise<SellerSession> {
  const res = await fetch(`${BASE_URL}/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = (await res.json()) as ApiResponse<SellerSession>;
  if (!res.ok || !data.success || !data.data) {
    throw new SellerApiError(
      data.error?.code || 'LOGIN_FAILED',
      data.error?.message || 'Sign in failed',
      res.status
    );
  }
  if (!data.data.isBusiness) {
    throw new SellerApiError(
      'NOT_BUSINESS',
      'This account is not a Grow! business. Use the Staff tab if you are an admin.',
      403
    );
  }
  return data.data;
}

export async function sellerRefresh(refreshToken: string): Promise<SellerSession> {
  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  const data = (await res.json()) as ApiResponse<SellerSession>;
  if (!res.ok || !data.success || !data.data) {
    throw new SellerApiError(
      data.error?.code || 'REFRESH_FAILED',
      data.error?.message || 'Session expired',
      res.status
    );
  }
  return data.data;
}

export async function sellerSignOut(refreshToken?: string | null) {
  await fetch(`${BASE_URL}/auth/sign-out`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(refreshToken ? { refreshToken } : {}),
  }).catch(() => undefined);
}

export async function sellerForgotPassword(email: string) {
  const res = await fetch(`${BASE_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = (await res.json()) as ApiResponse<{ message: string; devResetCode?: string }>;
  if (!res.ok || !data.success) {
    throw new SellerApiError(
      data.error?.code || 'REQUEST_FAILED',
      data.error?.message || 'Request failed',
      res.status
    );
  }
  return data.data!;
}

export async function sellerResetPassword(payload: {
  email: string;
  code: string;
  password: string;
}) {
  const res = await fetch(`${BASE_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as ApiResponse<{ message: string }>;
  if (!res.ok || !data.success) {
    throw new SellerApiError(
      data.error?.code || 'REQUEST_FAILED',
      data.error?.message || 'Reset failed',
      res.status
    );
  }
  return data.data!;
}

async function sellerFetch(path: string, options: RequestInit = {}, retried = false): Promise<Response> {
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };
  if (!(options.body instanceof FormData) && !headers['Content-Type'] && options.body) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getSellerToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401 && !retried) {
    const refresh = getSellerRefreshToken();
    if (refresh) {
      try {
        const session = await sellerRefresh(refresh);
        setSellerTokens(session.token, session.refreshToken || refresh);
        return sellerFetch(path, options, true);
      } catch {
        setSellerTokens(null, null);
      }
    }
  }
  return res;
}

export async function sellerRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await sellerFetch(path, options);
  const data = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !data.success) {
    throw new SellerApiError(
      data.error?.code || 'REQUEST_FAILED',
      data.error?.message || `Request failed (${res.status})`,
      res.status
    );
  }
  return data.data as T;
}

export async function sellerDownloadCsv(path: string, fallbackName: string): Promise<void> {
  const res = await sellerFetch(path);
  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try {
      const data = (await res.json()) as ApiResponse<unknown>;
      message = data.error?.message || message;
    } catch {
      /* ignore */
    }
    throw new SellerApiError('DOWNLOAD_FAILED', message, res.status);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type DashboardKpis = {
  period: string;
  total_products: number;
  total_stock: number;
  inventory_value: number;
  total_orders: number;
  pending_orders: number;
  completed_orders: number;
  total_revenue: number;
  gross_revenue: number;
  refunds: number;
  net_revenue: number;
  aov: number;
  units_sold: number;
  refund_rate: number;
  low_stock_count: number;
  out_of_stock_count: number;
  low_stock_threshold: number;
  action_items_count: number;
  active_partners: number;
  pending_partner_requests: number;
  deltas: { orders_pct: number; net_revenue_pct: number };
  recent_orders: Array<Record<string, unknown>>;
};

export type SellerProduct = {
  id: string;
  name: string;
  description?: string;
  category: string;
  subcategory?: string | null;
  price: number;
  stock: number;
  image_url?: string | null;
  units_sold?: number;
  created_at: string;
  updated_at: string;
};

export type SellerOrder = {
  id: string;
  status: string;
  total: number;
  payment_status?: string;
  created_at: string;
  shipping_address?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  items?: Array<{
    id: string;
    product_id: string;
    quantity: number;
    price: number;
    product_name?: string;
  }>;
};
