-- Enhanced product seed data with category-specific products
-- This creates realistic products with proper categories and images

-- First, ensure we have a system user for products (if not exists)
INSERT OR IGNORE INTO users (id, email, password_hash, points, is_instructor, is_business, metadata, created_at, updated_at)
VALUES (
  'system-user-products',
  'system-products@growl.app',
  'system-hash',
  0,
  0,
  0,
  '{"username": "Growl Marketplace", "categories": []}',
  datetime('now'),
  datetime('now')
);

-- Fitness Products
INSERT INTO products (id, user_id, name, description, category, subcategory, price, stock, image_url, images, metadata, created_at, updated_at)
VALUES
  ('prod-fitness-001', 'system-user-products', 'Premium Yoga Mat', 'Non-slip, eco-friendly yoga mat perfect for all practice levels. Extra thick for comfort.', 'fitness', 'yoga', 34.99, 45, NULL, '[]', '{"tags": ["yoga", "fitness", "wellness"]}', datetime('now'), datetime('now')),
  ('prod-fitness-002', 'system-user-products', 'Resistance Bands Set', 'Complete set of 5 resistance bands with different resistance levels. Perfect for home workouts.', 'fitness', 'weight-training', 29.99, 23, NULL, '[]', '{"tags": ["fitness", "home-gym", "strength"]}', datetime('now'), datetime('now')),
  ('prod-fitness-003', 'system-user-products', 'Protein Powder 2lb', 'Whey protein isolate with 25g protein per serving. Vanilla flavor.', 'fitness', 'gaining-weight', 45.50, 8, NULL, '[]', '{"tags": ["nutrition", "protein", "fitness"]}', datetime('now'), datetime('now')),
  ('prod-fitness-004', 'system-user-products', 'Fitness Tracker Watch', 'Smart fitness tracker with heart rate monitor, sleep tracking, and 7-day battery life.', 'fitness', NULL, 89.99, 67, NULL, '[]', '{"tags": ["tech", "fitness", "tracking"]}', datetime('now'), datetime('now')),
  ('prod-fitness-005', 'system-user-products', 'Adjustable Dumbbells', 'Space-saving adjustable dumbbells from 5-50lbs each. Perfect for home gym.', 'fitness', 'weight-training', 199.99, 12, NULL, '[]', '{"tags": ["fitness", "home-gym", "strength"]}', datetime('now'), datetime('now'));

-- Art & Creativity Products
INSERT INTO products (id, user_id, name, description, category, subcategory, price, stock, image_url, images, metadata, created_at, updated_at)
VALUES
  ('prod-art-001', 'system-user-products', 'Acrylic Paint Set', 'Professional 24-color acrylic paint set with brushes included. High-quality pigments.', 'art', 'painting', 39.99, 34, NULL, '[]', '{"tags": ["art", "painting", "creativity"]}', datetime('now'), datetime('now')),
  ('prod-art-002', 'system-user-products', 'Sketchbook Pro', 'Premium sketchbook with 120 pages of high-quality paper. Perfect for all drawing mediums.', 'art', 'drawing', 24.99, 56, NULL, '[]', '{"tags": ["art", "drawing", "sketching"]}', datetime('now'), datetime('now')),
  ('prod-art-003', 'system-user-products', 'Digital Drawing Tablet', '10-inch drawing tablet with pressure sensitivity. Perfect for digital art creation.', 'art', 'drawing', 149.99, 18, NULL, '[]', '{"tags": ["art", "digital", "technology"]}', datetime('now'), datetime('now')),
  ('prod-art-004', 'system-user-products', 'Watercolor Paint Set', 'Professional watercolor set with 36 vibrant colors and mixing palette.', 'art', 'painting', 49.99, 28, NULL, '[]', '{"tags": ["art", "painting", "watercolor"]}', datetime('now'), datetime('now'));

-- Music Products
INSERT INTO products (id, user_id, name, description, category, subcategory, price, stock, image_url, images, metadata, created_at, updated_at)
VALUES
  ('prod-music-001', 'system-user-products', 'Beginner Guitar Starter Pack', 'Complete starter pack with acoustic guitar, case, picks, and beginner guide book.', 'music', 'guitar', 199.99, 15, NULL, '[]', '{"tags": ["music", "guitar", "beginner"]}', datetime('now'), datetime('now')),
  ('prod-music-002', 'system-user-products', 'Electronic Keyboard 61 Keys', 'Full-size 61-key keyboard with 200 sounds and learning features. Perfect for beginners.', 'music', 'piano', 149.99, 22, NULL, '[]', '{"tags": ["music", "piano", "keyboard"]}', datetime('now'), datetime('now')),
  ('prod-music-003', 'system-user-products', 'Professional Microphone', 'Studio-quality USB microphone perfect for singing, podcasting, and recording.', 'music', 'singing', 79.99, 31, NULL, '[]', '{"tags": ["music", "singing", "recording"]}', datetime('now'), datetime('now')),
  ('prod-music-004', 'system-user-products', 'Drum Practice Pad', 'Professional drum practice pad with stand. Perfect for quiet practice sessions.', 'music', 'drums', 45.99, 19, NULL, '[]', '{"tags": ["music", "drums", "practice"]}', datetime('now'), datetime('now'));

-- Mindset & Wellness Products
INSERT INTO products (id, user_id, name, description, category, subcategory, price, stock, image_url, images, metadata, created_at, updated_at)
VALUES
  ('prod-mindset-001', 'system-user-products', 'Meditation Cushion Set', 'Premium zafu and zabuton meditation cushions. Comfortable and supportive.', 'mindset', 'meditation', 59.99, 27, NULL, '[]', '{"tags": ["meditation", "mindfulness", "wellness"]}', datetime('now'), datetime('now')),
  ('prod-mindset-002', 'system-user-products', 'Essential Oil Diffuser', 'Ultrasonic essential oil diffuser with LED lights. Perfect for meditation spaces.', 'mindset', 'meditation', 34.99, 41, NULL, '[]', '{"tags": ["meditation", "aromatherapy", "wellness"]}', datetime('now'), datetime('now')),
  ('prod-mindset-003', 'system-user-products', 'Gratitude Journal', 'Beautiful hardcover journal with daily prompts for gratitude and reflection.', 'mindset', 'mindfulness', 19.99, 68, NULL, '[]', '{"tags": ["mindfulness", "journaling", "wellness"]}', datetime('now'), datetime('now')),
  ('prod-mindset-004', 'system-user-products', 'Weighted Blanket 15lbs', 'Premium weighted blanket for better sleep and reduced anxiety. 100% cotton cover.', 'mindset', 'stress-management', 89.99, 14, NULL, '[]', '{"tags": ["wellness", "sleep", "anxiety"]}', datetime('now'), datetime('now'));

-- Cooking Products
INSERT INTO products (id, user_id, name, description, category, subcategory, price, stock, image_url, images, metadata, created_at, updated_at)
VALUES
  ('prod-cooking-001', 'system-user-products', 'Professional Chef Knife Set', '5-piece premium stainless steel knife set with wooden block. Razor sharp.', 'cooking', NULL, 129.99, 16, NULL, '[]', '{"tags": ["cooking", "kitchen", "tools"]}', datetime('now'), datetime('now')),
  ('prod-cooking-002', 'system-user-products', 'Stand Mixer', 'Powerful 5-quart stand mixer with multiple attachments. Perfect for baking.', 'cooking', 'baking', 249.99, 9, NULL, '[]', '{"tags": ["cooking", "baking", "appliances"]}', datetime('now'), datetime('now')),
  ('prod-cooking-003', 'system-user-products', 'Meal Prep Containers Set', 'BPA-free 20-piece meal prep container set. Microwave and dishwasher safe.', 'cooking', 'meal-prep', 24.99, 52, NULL, '[]', '{"tags": ["cooking", "meal-prep", "containers"]}', datetime('now'), datetime('now')),
  ('prod-cooking-004', 'system-user-products', 'Air Fryer', '5.8-quart digital air fryer. Healthier cooking with 75% less oil.', 'cooking', NULL, 89.99, 38, NULL, '[]', '{"tags": ["cooking", "appliances", "healthy"]}', datetime('now'), datetime('now'));

-- Reading & Learning Products
INSERT INTO products (id, user_id, name, description, category, subcategory, price, stock, image_url, images, metadata, created_at, updated_at)
VALUES
  ('prod-reading-001', 'system-user-products', 'E-Reader', '7-inch e-reader with backlight. Store thousands of books. Perfect for reading anywhere.', 'reading', NULL, 119.99, 25, NULL, '[]', '{"tags": ["reading", "books", "technology"]}', datetime('now'), datetime('now')),
  ('prod-reading-002', 'system-user-products', 'Reading Light', 'Adjustable LED reading light with clip. Perfect for bedtime reading.', 'reading', NULL, 19.99, 73, NULL, '[]', '{"tags": ["reading", "accessories", "lighting"]}', datetime('now'), datetime('now')),
  ('prod-reading-003', 'system-user-products', 'Language Learning Course', 'Complete online language learning course with interactive lessons. 12 languages available.', 'learning', 'languages', 79.99, 999, NULL, '[]', '{"tags": ["learning", "languages", "education"]}', datetime('now'), datetime('now')),
  ('prod-reading-004', 'system-user-products', 'Book Stand', 'Adjustable wooden book stand. Perfect for reading and studying hands-free.', 'reading', NULL, 29.99, 44, NULL, '[]', '{"tags": ["reading", "accessories", "study"]}', datetime('now'), datetime('now'));

-- Travel & Lifestyle Products
INSERT INTO products (id, user_id, name, description, category, subcategory, price, stock, image_url, images, metadata, created_at, updated_at)
VALUES
  ('prod-travel-001', 'system-user-products', 'Travel Backpack 40L', 'Waterproof travel backpack with laptop compartment. Perfect for adventures.', 'travel', NULL, 79.99, 29, NULL, '[]', '{"tags": ["travel", "backpack", "adventure"]}', datetime('now'), datetime('now')),
  ('prod-travel-002', 'system-user-products', 'Hiking Boots', 'Waterproof hiking boots with excellent grip. Comfortable for long treks.', 'travel', 'hiking', 129.99, 18, NULL, '[]', '{"tags": ["travel", "hiking", "outdoor"]}', datetime('now'), datetime('now')),
  ('prod-travel-003', 'system-user-products', 'Portable Water Filter', 'Compact water filter for safe drinking water anywhere. Perfect for camping.', 'travel', 'hiking', 39.99, 36, NULL, '[]', '{"tags": ["travel", "camping", "outdoor"]}', datetime('now'), datetime('now')),
  ('prod-travel-004', 'system-user-products', 'Gardening Tool Set', 'Complete 8-piece gardening tool set with carrying case. Perfect for beginners.', 'gardening', NULL, 49.99, 21, NULL, '[]', '{"tags": ["gardening", "tools", "outdoor"]}', datetime('now'), datetime('now'));
