import { z } from 'zod';
import { error } from './response';

// Order status enum
export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'completed' | 'cancelled';

const strongPasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password is too long')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[0-9]/, 'Password must include a number')
  .regex(/[^a-zA-Z0-9]/, 'Password must include a symbol');

export const signUpSchema = z.object({
  email: z.string().email('Invalid email address').max(254),
  password: strongPasswordSchema,
  username: z.string().min(3, 'Username must be at least 3 characters').max(32).optional(),
});

export const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required').max(128),
});

export const verifyEmailSchema = z.object({
  email: z.string().email('Invalid email address'),
  code: z.string().min(6, 'Enter your verification code').max(64),
});

export const ssoSchema = z
  .object({
    provider: z.enum(['google', 'facebook']),
    idToken: z.string().min(10).optional(),
    accessToken: z.string().min(10).optional(),
  })
  .refine(
    (d) => (d.provider === 'google' ? !!d.idToken : !!d.accessToken),
    { message: 'Google requires idToken; Facebook requires accessToken', path: ['idToken'] }
  );

export const createPostSchema = z.object({
  image_url: z.string().url().optional(),
  caption: z.string().max(2000, 'Caption too long').optional(),
  category: z.string().min(1, 'Category is required'),
  subcategory: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

/** Accept only http(s) URLs; strip local picker URIs (file://, ph://, content://) before validate. */
const productRemoteImageUrl = z.preprocess(
  (val) => {
    if (val === undefined || val === null) return undefined;
    const s = String(val).trim();
    if (!s) return undefined;
    if (/^https?:\/\//i.test(s)) return s;
    return undefined;
  },
  z.string().url().optional()
);

const productRemoteImageUrls = z.preprocess(
  (val) => {
    if (!Array.isArray(val)) return undefined;
    const filtered = val
      .map((x) => String(x).trim())
      .filter((s) => /^https?:\/\//i.test(s));
    return filtered.length ? filtered : undefined;
  },
  z.array(z.string().url()).optional()
);

export const createProductSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  description: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  subcategory: z.string().optional(),
  price: z.number().positive('Price must be positive'),
  stock: z.number().int().min(0, 'Stock cannot be negative'),
  image_url: productRemoteImageUrl,
  images: productRemoteImageUrls,
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

export const updateOrderStatusSchema = z.object({
  status: z.enum(['pending', 'processing', 'shipped', 'delivered', 'completed', 'cancelled'], {
    errorMap: () => ({ message: 'Invalid order status' }),
  }),
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


