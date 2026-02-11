import { z } from 'zod';
import { error } from './response';

// Validation schemas
export const signUpSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  username: z.string().min(3, 'Username must be at least 3 characters').optional(),
});

export const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const createPostSchema = z.object({
  image_url: z.string().url().optional(),
  caption: z.string().max(2000, 'Caption too long').optional(),
  category: z.string().min(1, 'Category is required'),
  subcategory: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const createProductSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  description: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  subcategory: z.string().optional(),
  price: z.number().positive('Price must be positive'),
  stock: z.number().int().min(0, 'Stock cannot be negative'),
  image_url: z.string().url().optional(),
  images: z.array(z.string().url()).optional(),
  metadata: z.record(z.any()).optional(),
});

export const createOrderSchema = z.object({
  items: z.array(
    z.object({
      product_id: z.string(),
      quantity: z.number().int().positive(),
    })
  ),
  shipping_address: z.object({
    name: z.string().min(1),
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    zip: z.string().min(1),
    country: z.string().min(1),
  }),
});

export const updateUserSchema = z.object({
  username: z.string().min(3).optional(),
  avatar: z.string().url().optional(),
  categories: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

/**
 * Validate request body against a schema
 */
export async function validateRequest<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; response: Response }> {
  try {
    const body = await request.json();
    const data = schema.parse(body);
    return { success: true, data };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return {
        success: false,
        response: error(
          'VALIDATION_ERROR',
          'Invalid request data',
          400,
          err.errors
        ),
      };
    }
    return {
      success: false,
      response: error('INVALID_JSON', 'Invalid JSON in request body', 400),
    };
  }
}


