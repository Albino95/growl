/**
 * Business API service
 */

import { request } from './http';
import type { Product, Order } from './marketplace';
export type { Order };

export interface DashboardKPIs {
  period?: 'today' | 'week' | 'month';
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

/**
 * Get business dashboard KPIs
 */
export async function getDashboard(period: 'today' | 'week' | 'month' = 'week'): Promise<DashboardResponse> {
  return request<DashboardResponse>(`/business/dashboard?period=${period}`);
}

/**
 * Get business products
 */
export async function getBusinessProducts(): Promise<{ success: boolean; data: { products: Product[] } }> {
  return request<{ success: boolean; data: { products: Product[] } }>('/business/products');
}

/**
 * Get business orders
 */
export async function getBusinessOrders(): Promise<{ success: boolean; data: Order[] }> {
  return request<{ success: boolean; data: Order[] }>('/business/orders');
}

export async function getBusinessOrderDetail(orderId: string): Promise<{ success: boolean; data: Order }> {
  return request<{ success: boolean; data: Order }>(`/business/orders/${encodeURIComponent(orderId)}`);
}

export async function getBusinessTimeseries(period: 'today' | 'week' | 'month' = 'week'): Promise<{
  success: boolean;
  data: { period: string; series: Array<{ day: string; orders: number; revenue: number }> };
}> {
  return request<{ success: boolean; data: { period: string; series: Array<{ day: string; orders: number; revenue: number }> } }>(
    `/business/analytics/timeseries?period=${period}`
  );
}

export async function getBusinessTopProducts(period: 'today' | 'week' | 'month' = 'month'): Promise<{
  success: boolean;
  data: { period: string; products: Array<{ id: string; name: string; image_url?: string; units_sold: number; revenue: number }> };
}> {
  return request<{
    success: boolean;
    data: { period: string; products: Array<{ id: string; name: string; image_url?: string; units_sold: number; revenue: number }> };
  }>(`/business/analytics/top-products?period=${period}`);
}

export async function getPartnershipPerformance(): Promise<{
  success: boolean;
  data: { partnerships: Array<{ id: string; instructor_id: string; instructor_name: string; instructor_avatar?: string | null; categories: string[]; partnership_type: string; commission_rate?: number | null; fixed_fee?: number | null; status: string; attributed_revenue: number }> };
}> {
  return request<{
    success: boolean;
    data: { partnerships: Array<{ id: string; instructor_id: string; instructor_name: string; instructor_avatar?: string | null; categories: string[]; partnership_type: string; commission_rate?: number | null; fixed_fee?: number | null; status: string; attributed_revenue: number }> };
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
  return request<{ success: boolean; data: { instructors: DiscoverInstructor[] } }>('/business/partnerships/discover');
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

export async function getBusinessSettings(): Promise<{ success: boolean; data: BusinessSettings }> {
  return request<{ success: boolean; data: BusinessSettings }>('/business/settings');
}

export async function updateBusinessSettings(payload: Partial<BusinessSettings>): Promise<{ success: boolean; data: { ok: boolean } }> {
  return request<{ success: boolean; data: { ok: boolean } }>('/business/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}
