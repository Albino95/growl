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

const clientPasswordHashSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/i, 'Invalid password hash format');

export const signUpSchema = z
  .object({
    email: z.string().email('Invalid email address').max(254),
    password: strongPasswordSchema.optional(),
    passwordHash: clientPasswordHashSchema.optional(),
    username: z.string().min(3, 'Username must be at least 3 characters').max(32).optional(),
  })
  .refine((data) => !!data.password || !!data.passwordHash, {
    message: 'password or passwordHash is required',
    path: ['password'],
  });

export const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required').max(128).optional(),
  passwordHash: clientPasswordHashSchema.optional(),
}).refine((data) => !!data.password || !!data.passwordHash, {
  message: 'password or passwordHash is required',
  path: ['password'],
});

export const verifyEmailSchema = z.object({
  email: z.string().email('Invalid email address'),
  code: z.string().min(6, 'Enter your verification code').max(64),
});

export const ssoSchema = z
  .object({
    provider: z.enum(['google', 'facebook', 'apple']),
    idToken: z.string().min(10).optional(),
    accessToken: z.string().min(10).optional(),
  })
  .refine(
    (d) =>
      d.provider === 'facebook' ? !!d.accessToken : !!d.idToken,
    { message: 'Google and Apple require idToken; Facebook requires accessToken', path: ['idToken'] }
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
  metadata: z
    .object({
      payment_method: z.string().optional(),
      payment_confirmed: z.boolean().optional(),
      stripe_checkout_session_id: z.string().optional(),
      source: z.enum(['organic', 'campaign', 'partnership']).optional(),
      referral_instructor_id: z.string().optional(),
      campaign_id: z.string().optional(),
    })
    .optional(),
});

export const checkoutSessionSchema = z.object({
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
  success_url: z.string().url().optional(),
  cancel_url: z.string().url().optional(),
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

export const createPartnershipRequestSchema = z.object({
  instructorId: z.string().min(1),
  partnershipType: z.enum(['commission', 'fixed', 'hybrid']),
  commissionRate: z.number().min(0).max(100).optional(),
  fixedFee: z.number().min(0).optional(),
  message: z.string().max(1000).optional(),
});

export const updatePartnershipRequestSchema = z.object({
  status: z.enum(['approved', 'declined']),
});

export const updateBusinessSettingsSchema = z.object({
  business_name: z.string().min(1).max(120).optional(),
  logo_url: z.string().url().optional(),
  analytics_prefs: z.record(z.any()).optional(),
  notifications_prefs: z.record(z.any()).optional(),
});

export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totp: z.string().min(6).max(8).optional(),
});

export const adminMfaEnableSchema = z.object({
  secret: z.string().min(16),
  totp: z.string().min(6).max(8),
});

export const reportDecisionSchema = z.object({
  decision: z.object({
    action: z.string().optional(),
    severity: z.string().optional(),
    reasonCode: z.string().min(1),
    reasonText: z.string().min(3),
    enforcement: z
      .object({
        contentAction: z.enum(['none', 'remove']).optional(),
        userAction: z.enum(['none', 'warn', 'suspend', 'ban']).optional(),
        strikeDelta: z.number().int().min(0).optional(),
        suspendDays: z.number().int().min(1).max(365).optional(),
      })
      .optional(),
    closeReport: z.boolean().optional(),
    notifyUser: z.boolean().optional(),
  }),
});

export const assignReportSchema = z.object({
  workflow_status: z.enum(['pending', 'investigating', 'actioned', 'closed']).optional(),
  priority: z.enum(['critical', 'high', 'normal', 'low']).optional(),
  assigned_admin_id: z.string().nullable().optional(),
});

export const appealDecisionSchema = z.object({
  status: z.enum(['upheld', 'overturned']),
  reasonText: z.string().min(3).optional(),
});

export const userEnforcementSchema = z.object({
  action: z.enum(['warn', 'suspend', 'ban', 'restore']),
  reasonCode: z.string().min(1),
  reasonText: z.string().min(3),
  suspendDays: z.number().int().min(1).max(365).optional(),
});

export const userRoleUpdateSchema = z.object({
  is_instructor: z.boolean().optional(),
  is_business: z.boolean().optional(),
});

export const privacyRequestCreateSchema = z.object({
  userId: z.string().min(1),
  requestType: z.enum(['export', 'delete']),
  details: z.record(z.any()).optional(),
});

export const privacyRequestUpdateSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'rejected']),
  assigned_admin_id: z.string().optional(),
});

export const adminRefundSchema = z.object({
  amount: z.number().positive(),
  reasonText: z.string().min(3),
});

const businessFieldSchema = z.enum([
  'fitness',
  'nutrition',
  'apparel',
  'wellness',
  'education',
  'other',
]);

export const createBusinessAccountSchema = z.object({
  email: z.string().email().max(254),
  temporaryPassword: strongPasswordSchema,
  displayName: z.string().min(2).max(120),
  contactEmail: z.string().email().max(254),
  contactPhone: z.string().max(32).optional(),
  fieldOfOperation: businessFieldSchema,
  vatNumber: z.string().max(64).optional(),
  countryCode: z.string().max(8).optional(),
  addressLine: z.string().max(256).optional(),
  notes: z.string().max(2000).optional(),
});

export const updateBusinessAccountSchema = z.object({
  displayName: z.string().min(2).max(120).optional(),
  contactEmail: z.string().email().max(254).optional(),
  contactPhone: z.string().max(32).optional(),
  fieldOfOperation: businessFieldSchema.optional(),
  vatNumber: z.string().max(64).optional(),
  countryCode: z.string().max(8).optional(),
  addressLine: z.string().max(256).optional(),
  verificationStatus: z.enum(['pending', 'verified', 'rejected']).optional(),
  notes: z.string().max(2000).optional(),
  deactivate: z.boolean().optional(),
});

const journalMoodSchema = z
  .enum([
    'happy',
    'excited',
    'calm',
    'sad',
    'anxious',
    'grateful',
    'proud',
    'tired',
    'motivated',
    'peaceful',
    'determined',
  ])
  .optional();

export const createJournalEntrySchema = z.object({
  title: z.string().max(200).optional(),
  content: z.string().min(1, 'Content is required').max(5000, 'Content too long'),
  mood: journalMoodSchema,
  tags: z.array(z.string().max(40)).max(20).optional(),
  is_public: z.boolean().optional().default(false),
  metadata: z.record(z.any()).optional(),
});

export const updateJournalEntrySchema = z.object({
  title: z.string().max(200).nullable().optional(),
  content: z.string().min(1).max(5000).optional(),
  mood: journalMoodSchema.nullable(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  is_public: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
});

export const createConversationSchema = z.object({
  targetUserId: z.string().min(1, 'targetUserId is required'),
});

export const sendMessageSchema = z.object({
  body: z.string().min(1, 'Message cannot be empty').max(4000, 'Message too long'),
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


