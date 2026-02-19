/**
 * Business API service
 */

import { request } from './http';
import type { Product, Order } from './marketplace';

export interface DashboardKPIs {
  total_products: number;
  total_stock: number;
  total_orders: number;
  pending_orders: number;
  completed_orders: number;
  total_revenue: number;
  recent_orders: Order[];
}

export interface DashboardResponse {
  success: boolean;
  data: {
    kpis: DashboardKPIs;
  };
}

/**
 * Get business dashboard KPIs
 */
export async function getDashboard(): Promise<DashboardResponse> {
  return request<DashboardResponse>('/business/dashboard');
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
