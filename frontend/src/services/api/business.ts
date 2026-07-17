/**
 * Business API service
 */

import Constants from 'expo-constants';
import { getSecureItem } from '../storage/secureStore';
import { getToken } from '../storage/tokenManager';
import { messageFromApiError } from './apiErrors';
import { request } from './http';
import type { Product, Order } from './marketplace';
export type { Order };

const BASE_URL: string =
  (Constants?.expoConfig?.extra?.API_BASE_URL as string) ||
  'https://growl-backend.albino-ndreu.workers.dev/api/v1';

async function authHeaders(): Promise<Record<string, string>> {
  let token: string | null = getToken();
  if (!token) {
    try {
      token = await getSecureItem('auth_token');
      if (token) {
        const { setToken } = await import('../storage/tokenManager');
        setToken(token);
      }
    } catch {
      // ignore
    }
  }
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchRawText(path: string): Promise<string> {
  const url = `${BASE_URL}${path}`;
  const headers = await authHeaders();
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) {
    try {
      const data = JSON.parse(text) as { success?: boolean; error?: { message?: string } };
      throw new Error(messageFromApiError(data, res.status));
    } catch (e: unknown) {
      if (e instanceof Error) throw e;
      throw new Error(text || 'Request failed');
    }
  }
  return text;
}

export type BusinessPeriod = 'today' | 'week' | 'month';

export interface DashboardKPIs {
  period?: BusinessPeriod;
  total_products: number;
  total_stock: number;
  inventory_value?: number;
  total_orders: number;
  pending_orders: number;
  completed_orders: number;
  total_revenue: number;
  gross_revenue?: number;
  net_revenue?: number;
  refunds?: number;
  aov?: number;
  units_sold?: number;
  refund_rate?: number;
  low_stock_count?: number;
  out_of_stock_count?: number;
  low_stock_threshold?: number;
  action_items_count?: number;
  active_partners?: number;
  pending_partner_requests?: number;
  deltas?: {
    orders_pct: number;
    net_revenue_pct: number;
  };
  recent_orders?: Order[];
}

export interface DashboardResponse {
  success: boolean;
  data: {
    kpis: DashboardKPIs;
  };
}

export interface TimeseriesPoint {
  day: string;
  orders: number;
  revenue: number;
}

export interface OrderFunnel {
  pending: number;
  processing: number;
  shipped: number;
  delivered: number;
  completed: number;
  cancelled: number;
}

export interface PartnershipRecord {
  id: string;
  instructor_id: string;
  instructor_name: string;
  instructor_avatar?: string | null;
  categories?: string[];
  partnership_type: 'commission' | 'fixed' | 'hybrid';
  commission_rate?: number | null;
  fixed_fee?: number | null;
  status: 'active' | 'paused' | 'ended';
  created_at: string;
}

export interface PartnershipRequestRecord {
  id: string;
  instructor_id: string;
  instructor_name: string;
  instructor_avatar?: string | null;
  categories?: string[];
  status: 'pending' | 'approved' | 'declined';
  partnership_type: 'commission' | 'fixed' | 'hybrid';
  commission_rate?: number | null;
  fixed_fee?: number | null;
  message?: string | null;
  created_at: string;
}

export interface DiscoverInstructor {
  id: string;
  username: string;
  avatar?: string | null;
  categories: string[];
  points: number;
  vote_count: number;
}

export interface BusinessSettings {
  business_name: string;
  logo_url?: string | null;
  analytics_prefs: Record<string, unknown>;
  notifications_prefs: Record<string, unknown>;
}

export type MarketingCampaign = {
  id: string;
  business_id: string;
  name: string;
  type: 'promotion' | 'sponsored' | 'influencer';
  budget: number;
  spent: number;
  status: 'active' | 'paused' | 'completed';
  start_date?: string | null;
  end_date?: string | null;
  product_ids?: string[];
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type BusinessProduct = Product & { units_sold?: number };

export async function getDashboard(period: BusinessPeriod = 'week'): Promise<DashboardResponse> {
  return request<DashboardResponse>(`/business/dashboard?period=${period}`);
}

export async function getBusinessProducts(
  period: BusinessPeriod = 'month'
): Promise<{ success: boolean; data: { products: BusinessProduct[] } }> {
  return request<{ success: boolean; data: { products: BusinessProduct[] } }>(
    `/business/products?period=${period}`
  );
}

export async function getBusinessOrders(): Promise<{ success: boolean; data: Order[] }> {
  return request<{ success: boolean; data: Order[] }>('/business/orders');
}

export async function getBusinessOrderDetail(orderId: string): Promise<{ success: boolean; data: Order }> {
  return request<{ success: boolean; data: Order }>(`/business/orders/${encodeURIComponent(orderId)}`);
}

export async function getBusinessTimeseries(period: BusinessPeriod = 'week'): Promise<{
  success: boolean;
  data: { period: string; series: TimeseriesPoint[] };
}> {
  return request<{ success: boolean; data: { period: string; series: TimeseriesPoint[] } }>(
    `/business/analytics/timeseries?period=${period}`
  );
}

export async function getBusinessFunnel(period: BusinessPeriod = 'week'): Promise<{
  success: boolean;
  data: { period: string; funnel: OrderFunnel };
}> {
  return request<{ success: boolean; data: { period: string; funnel: OrderFunnel } }>(
    `/business/analytics/funnel?period=${period}`
  );
}

export async function getBusinessTopProducts(period: BusinessPeriod = 'month'): Promise<{
  success: boolean;
  data: {
    period: string;
    products: Array<{ id: string; name: string; image_url?: string; units_sold: number; revenue: number }>;
  };
}> {
  return request<{
    success: boolean;
    data: {
      period: string;
      products: Array<{ id: string; name: string; image_url?: string; units_sold: number; revenue: number }>;
    };
  }>(`/business/analytics/top-products?period=${period}`);
}

export async function getPartnershipPerformance(): Promise<{
  success: boolean;
  data: {
    partnerships: Array<{
      id: string;
      instructor_id: string;
      instructor_name: string;
      instructor_avatar?: string | null;
      categories: string[];
      partnership_type: string;
      commission_rate?: number | null;
      fixed_fee?: number | null;
      status: string;
      attributed_revenue: number;
    }>;
  };
}> {
  return request<{
    success: boolean;
    data: {
      partnerships: Array<{
        id: string;
        instructor_id: string;
        instructor_name: string;
        instructor_avatar?: string | null;
        categories: string[];
        partnership_type: string;
        commission_rate?: number | null;
        fixed_fee?: number | null;
        status: string;
        attributed_revenue: number;
      }>;
    };
  }>('/business/analytics/partnerships');
}

export async function getPartnerships(): Promise<{
  success: boolean;
  data: { partnerships: PartnershipRecord[]; requests: PartnershipRequestRecord[] };
}> {
  return request<{
    success: boolean;
    data: { partnerships: PartnershipRecord[]; requests: PartnershipRequestRecord[] };
  }>('/business/partnerships');
}

export async function getPartnershipDiscover(): Promise<{
  success: boolean;
  data: { instructors: DiscoverInstructor[] };
}> {
  return request<{ success: boolean; data: { instructors: DiscoverInstructor[] } }>(
    '/business/partnerships/discover'
  );
}

export async function createPartnershipRequest(payload: {
  instructorId: string;
  partnershipType: 'commission' | 'fixed' | 'hybrid';
  commissionRate?: number;
  fixedFee?: number;
  message?: string;
}): Promise<{ success: boolean; data: { ok: boolean } }> {
  return request<{ success: boolean; data: { ok: boolean } }>('/business/partnerships/requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updatePartnershipRequest(
  requestId: string,
  status: 'approved' | 'declined'
): Promise<{ success: boolean; data: { ok: boolean } }> {
  return request<{ success: boolean; data: { ok: boolean } }>(
    `/business/partnerships/requests/${encodeURIComponent(requestId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }
  );
}

export async function updatePartnershipStatus(
  partnershipId: string,
  status: 'active' | 'paused' | 'ended'
): Promise<{ success: boolean; data: { ok: boolean } }> {
  return request<{ success: boolean; data: { ok: boolean } }>(
    `/business/partnerships/${encodeURIComponent(partnershipId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }
  );
}

export async function getBusinessSettings(): Promise<{ success: boolean; data: BusinessSettings }> {
  return request<{ success: boolean; data: BusinessSettings }>('/business/settings');
}

export async function updateBusinessSettings(
  payload: Partial<BusinessSettings>
): Promise<{ success: boolean; data: { ok: boolean } }> {
  return request<{ success: boolean; data: { ok: boolean } }>('/business/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function listCampaigns(): Promise<{ success: boolean; data: { campaigns: MarketingCampaign[] } }> {
  return request<{ success: boolean; data: { campaigns: MarketingCampaign[] } }>('/business/campaigns');
}

export async function createCampaign(payload: {
  name: string;
  type: MarketingCampaign['type'];
  budget: number;
  start_date?: string;
  end_date?: string;
  product_ids?: string[];
  metadata?: Record<string, unknown>;
}): Promise<{ success: boolean; data: MarketingCampaign }> {
  return request<{ success: boolean; data: MarketingCampaign }>('/business/campaigns', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateCampaign(
  campaignId: string,
  payload: Partial<{
    name: string;
    type: MarketingCampaign['type'];
    budget: number;
    status: MarketingCampaign['status'];
    start_date: string | null;
    end_date: string | null;
    product_ids: string[];
    metadata: Record<string, unknown>;
  }>
): Promise<{ success: boolean; data: MarketingCampaign }> {
  return request<{ success: boolean; data: MarketingCampaign }>(
    `/business/campaigns/${encodeURIComponent(campaignId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
}

export type BusinessCustomer = {
  user_id: string;
  email: string;
  username: string;
  avatar?: string | null;
  order_count: number;
  total_spent: number;
  last_order_at: string;
};

export type BusinessNotification = {
  id: string;
  business_id: string;
  type: string;
  title: string;
  body?: string | null;
  ref_type?: string | null;
  ref_id?: string | null;
  read_at?: string | null;
  read: boolean;
  created_at: string;
};

export type PromoCode = {
  id: string;
  business_id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  max_uses?: number | null;
  uses: number;
  active: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type OrderFulfillmentPayload = {
  tracking_number?: string;
  carrier?: string;
  label_url?: string;
};

export async function getBusinessCustomers(): Promise<{ customers: BusinessCustomer[] }> {
  return request<{ customers: BusinessCustomer[] }>('/business/customers');
}

export async function updateOrderFulfillment(
  orderId: string,
  payload: OrderFulfillmentPayload
): Promise<{ ok: boolean; metadata: Record<string, unknown> }> {
  return request<{ ok: boolean; metadata: Record<string, unknown> }>(
    `/business/orders/${encodeURIComponent(orderId)}/fulfillment`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
}

export async function requestOrderRefund(
  orderId: string,
  payload: { reason: string; amount?: number }
): Promise<{ ok: boolean; metadata: Record<string, unknown> }> {
  return request<{ ok: boolean; metadata: Record<string, unknown> }>(
    `/business/orders/${encodeURIComponent(orderId)}/refund-request`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function exportOrdersCsv(period: BusinessPeriod = 'month'): Promise<string> {
  return fetchRawText(`/business/export/orders?period=${period}`);
}

export async function exportProductsCsv(): Promise<string> {
  return fetchRawText('/business/export/products');
}

export async function getBusinessNotifications(
  limit = 50
): Promise<{ notifications: BusinessNotification[] }> {
  return request<{ notifications: BusinessNotification[] }>(
    `/business/notifications?limit=${limit}`
  );
}

export async function markBusinessNotificationRead(
  notificationId: string
): Promise<{ ok: boolean; read_at: string }> {
  return request<{ ok: boolean; read_at: string }>(
    `/business/notifications/${encodeURIComponent(notificationId)}/read`,
    { method: 'PATCH' }
  );
}

export async function listPromoCodes(): Promise<{ promo_codes: PromoCode[] }> {
  return request<{ promo_codes: PromoCode[] }>('/business/promo-codes');
}

export async function createPromoCode(payload: {
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  max_uses?: number;
}): Promise<PromoCode> {
  return request<PromoCode>('/business/promo-codes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updatePromoCode(
  promoId: string,
  payload: Partial<{
    active: boolean;
    max_uses: number | null;
    starts_at: string | null;
    ends_at: string | null;
    metadata: Record<string, unknown>;
  }>
): Promise<PromoCode> {
  return request<PromoCode>(`/business/promo-codes/${encodeURIComponent(promoId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
