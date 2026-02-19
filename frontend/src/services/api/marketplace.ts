/**
 * Marketplace API service
 */

import { request } from './http';

export interface Product {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  category: string;
  subcategory?: string;
  price: number;
  stock: number;
  image_url?: string;
  images?: string[];
  metadata?: any;
  created_at: string;
  updated_at: string;
  business?: {
    id: string;
    username?: string;
    avatar?: string;
  };
}

export interface ProductsResponse {
  success: boolean;
  data: {
    products: Product[];
    total: number;
    limit: number;
    offset: number;
  };
}

export interface ProductResponse {
  success: boolean;
  data: Product;
}

export interface OrderItem {
  product_id: string;
  quantity: number;
}

export interface ShippingAddress {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface CreateOrderRequest {
  items: OrderItem[];
  shipping_address: ShippingAddress;
}

export interface Order {
  id: string;
  user_id: string;
  status: string;
  total: number;
  shipping_address: ShippingAddress;
  items: Array<{
    id: string;
    product_id: string;
    quantity: number;
    price: number;
    product_name?: string;
    product_image?: string;
  }>;
  created_at: string;
  updated_at: string;
}

export interface OrderResponse {
  success: boolean;
  data: Order;
}

/**
 * Get all products with optional filters
 */
export async function getProducts(params?: {
  category?: string;
  subcategory?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<ProductsResponse> {
  const queryParams = new URLSearchParams();
  if (params?.category) queryParams.append('category', params.category);
  if (params?.subcategory) queryParams.append('subcategory', params.subcategory);
  if (params?.search) queryParams.append('search', params.search);
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.offset) queryParams.append('offset', params.offset.toString());

  const query = queryParams.toString();
  return request<ProductsResponse>(`/marketplace/products${query ? `?${query}` : ''}`);
}

/**
 * Get a single product by ID
 */
export async function getProduct(productId: string): Promise<ProductResponse> {
  return request<ProductResponse>(`/marketplace/products/${productId}`);
}

/**
 * Create a new order
 */
export async function createOrder(orderData: CreateOrderRequest): Promise<OrderResponse> {
  return request<OrderResponse>('/marketplace/orders', {
    method: 'POST',
    body: JSON.stringify(orderData),
  });
}

/**
 * Get user's orders
 */
export async function getOrders(): Promise<{ success: boolean; data: Order[] }> {
  return request<{ success: boolean; data: Order[] }>('/marketplace/orders');
}

/**
 * Create a new product (business only)
 */
export async function createProduct(productData: {
  name: string;
  description?: string;
  category: string;
  subcategory?: string;
  price: number;
  stock: number;
  image_url?: string;
  images?: string[];
  metadata?: any;
}): Promise<ProductResponse> {
  return request<ProductResponse>('/marketplace/products', {
    method: 'POST',
    body: JSON.stringify(productData),
  });
}

/**
 * Update a product (business only)
 */
export async function updateProduct(
  productId: string,
  productData: Partial<{
    name: string;
    description: string;
    category: string;
    subcategory: string;
    price: number;
    stock: number;
    image_url: string;
    images: string[];
    metadata: any;
  }>
): Promise<ProductResponse> {
  return request<ProductResponse>(`/marketplace/products/${productId}`, {
    method: 'PUT',
    body: JSON.stringify(productData),
  });
}

/**
 * Delete a product (business only)
 */
export async function deleteProduct(productId: string): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>(`/marketplace/products/${productId}`, {
    method: 'DELETE',
  });
}

/**
 * Get business products
 */
export async function getBusinessProducts(): Promise<ProductsResponse> {
  return request<ProductsResponse>('/business/products');
}
