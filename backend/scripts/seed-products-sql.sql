-- Seed products directly via SQL
-- Run with: npx wrangler d1 execute growl-db --file=scripts/seed-products-sql.sql --remote
-- 
-- This script creates products that any user can view and purchase.
-- Products are owned by a system user (or first available user).
-- Regular users can browse and buy products without being a business.

-- Get or create a system user for products
-- Use first existing user, or create a system user if none exist
INSERT OR IGNORE INTO users (id, email, password_hash, points, is_instructor, is_business, metadata, created_at, updated_at)
VALUES (
  'system-marketplace-001',
  'marketplace@growl.app',
  '$2a$10$dummyhashforseedonly', -- Dummy hash, not used for login
  0,
  0,
  0, -- Not marked as business, but can own products via SQL
  '{"username":"Growl Marketplace"}',
  datetime('now'),
  datetime('now')
);

-- Insert sample products
-- Use system user or first available user
INSERT OR IGNORE INTO products (id, user_id, name, description, category, subcategory, price, stock, image_url, images, metadata, created_at, updated_at)
VALUES
  (
    'product-001',
    COALESCE((SELECT id FROM users WHERE id = 'system-marketplace-001'), (SELECT id FROM users LIMIT 1)),
    'Premium Fitness Tracker',
    'Advanced fitness tracker with heart rate monitor, step counter, and sleep tracking. Waterproof design perfect for all your workouts.',
    'fitness',
    'losing-weight',
    99.99,
    50,
    'https://images.unsplash.com/photo-1571019613454-1cb2f99b84d4?w=800&h=600&fit=crop',
    '[]',
    '{}',
    datetime('now'),
    datetime('now')
  ),
  (
    'product-002',
    COALESCE((SELECT id FROM users WHERE id = 'system-marketplace-001'), (SELECT id FROM users LIMIT 1)),
    'Yoga Mat Pro',
    'Professional grade yoga mat with superior grip and cushioning. Eco-friendly materials, perfect for all yoga styles.',
    'fitness',
    'flexibility',
    49.99,
    75,
    'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&h=600&fit=crop',
    '[]',
    '{}',
    datetime('now'),
    datetime('now')
  ),
  (
    'product-003',
    COALESCE((SELECT id FROM users WHERE id = 'system-marketplace-001'), (SELECT id FROM users LIMIT 1)),
    'Digital Piano Course',
    'Complete online piano course for beginners. Learn at your own pace with video lessons, sheet music, and practice exercises.',
    'art',
    'piano',
    79.99,
    100,
    'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=800&h=600&fit=crop',
    '[]',
    '{}',
    datetime('now'),
    datetime('now')
  ),
  (
    'product-004',
    COALESCE((SELECT id FROM users WHERE id = 'system-marketplace-001'), (SELECT id FROM users LIMIT 1)),
    'Meal Prep Containers Set',
    'BPA-free meal prep containers with leak-proof lids. Perfect for meal planning and portion control. Microwave and dishwasher safe.',
    'nutrition',
    'meal-planning',
    29.99,
    200,
    'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800&h=600&fit=crop',
    '[]',
    '{}',
    datetime('now'),
    datetime('now')
  ),
  (
    'product-005',
    COALESCE((SELECT id FROM users WHERE id = 'system-marketplace-001'), (SELECT id FROM users LIMIT 1)),
    'Meditation App Premium',
    'Premium subscription to guided meditation app. Access to hundreds of sessions, sleep stories, and mindfulness exercises.',
    'mindset',
    'meditation',
    9.99,
    1000,
    'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&h=600&fit=crop',
    '[]',
    '{}',
    datetime('now'),
    datetime('now')
  ),
  (
    'product-006',
    COALESCE((SELECT id FROM users WHERE id = 'system-marketplace-001'), (SELECT id FROM users LIMIT 1)),
    'Habit Tracker Journal',
    'Beautiful physical journal for tracking habits, goals, and daily reflections. Premium paper, perfect binding.',
    'discipline',
    'habit-building',
    19.99,
    150,
    'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=800&h=600&fit=crop',
    '[]',
    '{}',
    datetime('now'),
    datetime('now')
  ),
  (
    'product-007',
    COALESCE((SELECT id FROM users WHERE id = 'system-marketplace-001'), (SELECT id FROM users LIMIT 1)),
    'Resistance Bands Set',
    'Professional resistance bands set with 5 different resistance levels. Perfect for home workouts and travel.',
    'fitness',
    'strength-training',
    34.99,
    120,
    'https://images.unsplash.com/photo-1571019613454-1cb2f99b84d4?w=800&h=600&fit=crop',
    '[]',
    '{}',
    datetime('now'),
    datetime('now')
  ),
  (
    'product-008',
    COALESCE((SELECT id FROM users WHERE id = 'system-marketplace-001'), (SELECT id FROM users LIMIT 1)),
    'Healthy Cookbook Collection',
    'Digital cookbook with 200+ healthy recipes. Includes meal plans, shopping lists, and nutritional information.',
    'nutrition',
    'healthy-eating',
    24.99,
    500,
    'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800&h=600&fit=crop',
    '[]',
    '{}',
    datetime('now'),
    datetime('now')
  );
