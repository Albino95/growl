/**
 * Marketplace routes tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, createMockEnv, parseJsonResponse } from '../utils/test-helpers';
import * as marketplaceRoutes from '../../src/routes/marketplace';
import type { Env } from '../../src/types';

describe('Marketplace Routes', () => {
  let env: Env;
  let mockDb: any;

  beforeEach(() => {
    env = createMockEnv();
    mockDb = {
      prepare: (query: string) => ({
        bind: (...args: any[]) => ({
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ success: true }),
        }),
      }),
    };
    env.DB = mockDb as any;
  });

  describe('getProducts', () => {
    it('should return products list', async () => {
      const mockProducts = [
        {
          id: 'prod-1',
          user_id: 'user-1',
          name: 'Test Product',
          description: 'Test Description',
          category: 'fitness',
          price: 29.99,
          stock: 10,
          image_url: 'https://example.com/image.jpg',
          images: '[]',
          metadata: '{}',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      mockDb.prepare = (query: string) => {
        if (query.includes('SELECT')) {
          return {
            bind: () => ({
              all: async () => ({ results: mockProducts }),
            }),
          };
        }
        return {
          bind: () => ({
            first: async () => null,
            all: async () => ({ results: [] }),
            run: async () => ({ success: true }),
          }),
        };
      };

      const request = createMockRequest('https://example.com/api/v1/marketplace/products', {
        method: 'GET',
      });

      const response = await marketplaceRoutes.getProducts(request, env);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data.products)).toBe(true);
    });

    it('should filter by category', async () => {
      const request = createMockRequest('https://example.com/api/v1/marketplace/products?category=fitness', {
        method: 'GET',
      });

      mockDb.prepare = (query: string) => {
        if (query.includes('category')) {
          return {
            bind: () => ({
              all: async () => ({ results: [] }),
            }),
          };
        }
        return {
          bind: () => ({
            all: async () => ({ results: [] }),
          }),
        };
      };

      const response = await marketplaceRoutes.getProducts(request, env);
      expect(response.status).toBe(200);
    });
  });

  describe('getProduct', () => {
    it('should return product details', async () => {
      const mockProduct = {
        id: 'prod-1',
        user_id: 'user-1',
        name: 'Test Product',
        description: 'Test Description',
        category: 'fitness',
        price: 29.99,
        stock: 10,
        image_url: 'https://example.com/image.jpg',
        images: '[]',
        metadata: '{}',
        created_at: '2024-01-01T00:00:00Z',
      };

      mockDb.prepare = (query: string) => {
        if (query.includes('SELECT')) {
          return {
            bind: () => ({
              first: async () => mockProduct,
            }),
          };
        }
        return {
          bind: () => ({
            first: async () => null,
          }),
        };
      };

      const request = createMockRequest('https://example.com/api/v1/marketplace/products/prod-1', {
        method: 'GET',
      });

      const response = await marketplaceRoutes.getProduct(request, env, 'prod-1');
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('prod-1');
    });

    it('should return 404 for non-existent product', async () => {
      mockDb.prepare = (query: string) => {
        return {
          bind: () => ({
            first: async () => null,
          }),
        };
      };

      const request = createMockRequest('https://example.com/api/v1/marketplace/products/nonexistent', {
        method: 'GET',
      });

      const response = await marketplaceRoutes.getProduct(request, env, 'nonexistent');
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });
  });

  describe('createProduct', () => {
    it('should create product for business user', async () => {
      let productCreated = false;
      
      mockDb.prepare = (query: string) => {
        if (query.includes('SELECT * FROM users')) {
          return {
            bind: () => ({
              first: async () => ({
                id: 'business-user',
                is_business: true,
              }),
            }),
          };
        }
        if (query.includes('INSERT INTO products')) {
          productCreated = true;
          return {
            bind: () => ({
              run: async () => ({ success: true }),
            }),
          };
        }
        return {
          bind: () => ({
            first: async () => null,
            run: async () => ({ success: true }),
          }),
        };
      };

      const request = createMockRequest('https://example.com/api/v1/marketplace/products', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
        },
        body: {
          name: 'New Product',
          description: 'Product Description',
          category: 'fitness',
          price: 29.99,
          stock: 10,
        },
      });

      const response = await marketplaceRoutes.createProduct(request, env);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(productCreated).toBe(true);
    });

    it('should reject non-business users', async () => {
      mockDb.prepare = (query: string) => {
        if (query.includes('SELECT * FROM users')) {
          return {
            bind: () => ({
              first: async () => ({
                id: 'regular-user',
                is_business: false,
              }),
            }),
          };
        }
        return {
          bind: () => ({
            first: async () => null,
          }),
        };
      };

      const request = createMockRequest('https://example.com/api/v1/marketplace/products', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
        },
        body: {
          name: 'New Product',
          category: 'fitness',
          price: 29.99,
          stock: 10,
        },
      });

      const response = await marketplaceRoutes.createProduct(request, env);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('FORBIDDEN');
    });
  });

  describe('getPaymentConfig', () => {
    it('should return enabled false when STRIPE_SECRET_KEY is unset', async () => {
      const request = createMockRequest('https://example.com/api/v1/marketplace/payment-config', {
        method: 'GET',
      });

      const response = await marketplaceRoutes.getPaymentConfig(request, env);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.enabled).toBe(false);
    });

    it('should return enabled true when STRIPE_SECRET_KEY is set', async () => {
      env.STRIPE_SECRET_KEY = 'sk_test_example';

      const request = createMockRequest('https://example.com/api/v1/marketplace/payment-config', {
        method: 'GET',
      });

      const response = await marketplaceRoutes.getPaymentConfig(request, env);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.data.enabled).toBe(true);
    });
  });

  describe('createOrder payment gating', () => {
    it('should return 503 when payments are disabled', async () => {
      const request = createMockRequest('https://example.com/api/v1/marketplace/orders', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token' },
        body: {
          items: [{ product_id: 'prod-1', quantity: 1 }],
          shipping_address: {
            name: 'Test User',
            street: '123 Main St',
            city: 'Austin',
            state: 'TX',
            zip: '78701',
            country: 'United States',
          },
        },
      });

      const response = await marketplaceRoutes.createOrder(request, env);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(503);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('PAYMENTS_DISABLED');
    });
  });
});
