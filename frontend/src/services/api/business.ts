/**
 * Business API service
 */

import { request } from './http';
import type { Product, Order } from './marketplace';
export type { Order };

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
