#!/usr/bin/env node
/**
 * Generates backend/scripts/seed-demo-products-dense.sql
 * Marketplace catalog owned by demo-core-business (business@growl.app).
 *
 * Run:
 *   node scripts/generate-dense-products-seed.js
 *   npm run seed:products:dense:qa
 *   npm run seed:products:dense:dev
 */
const fs = require('fs');
const path = require('path');

const OWNER = 'demo-core-business';

function esc(s) {
  return String(s).replace(/'/g, "''");
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Unsplash product / lifestyle photography */
const CATALOG = [
  // Fitness
  ['prod-dense-001', 'Cork Yoga Mat', 'Non-slip natural cork mat with extra cushion. Studio-grade grip when damp.', 'fitness', 'flexibility', 42.0, 48, 'https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=1080&q=80'],
  ['prod-dense-002', 'Resistance Bands 5-Pack', 'Loop bands from extra-light to extra-heavy. Carry pouch included.', 'fitness', 'strength', 24.99, 90, 'https://images.unsplash.com/photo-1598289431512-b97b0917affc?w=1080&q=80'],
  ['prod-dense-003', 'Adjustable Dumbbell Pair', '5–50 lb pair with quick-select dial. Compact home-gym staple.', 'fitness', 'building-muscle', 219.0, 14, 'https://images.unsplash.com/photo-1517836357483-507a3093906b?w=1080&q=80'],
  ['prod-dense-004', 'Kettlebell 16kg', 'Cast-iron kettlebell with powder coat. Clean swings, squats, and presses.', 'fitness', 'strength', 54.5, 32, 'https://images.unsplash.com/photo-1517963879433-6ad2b056d944?w=1080&q=80'],
  ['prod-dense-005', 'Jump Rope Pro', 'Weighted handles, adjustable steel cable. Cardio that fits in a bag.', 'fitness', 'cardio', 18.99, 110, 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1080&q=80'],
  ['prod-dense-006', 'Foam Roller', 'High-density roller for recovery and mobility. 18-inch length.', 'fitness', 'flexibility', 22.0, 64, 'https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=1080&q=80'],
  ['prod-dense-007', 'Pull-Up Bar', 'Doorway pull-up bar with padded grips. No screws required.', 'fitness', 'building-muscle', 39.99, 41, 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1080&q=80'],
  ['prod-dense-008', 'Running Belt', 'Bounce-free belt for phone, keys, and gels. Reflective trim.', 'fitness', 'cardio', 19.5, 78, 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=1080&q=80'],
  ['prod-dense-009', 'Yoga Block Pair', 'EVA foam blocks for alignment and supported stretches.', 'fitness', 'flexibility', 16.99, 95, 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=1080&q=80'],
  ['prod-dense-010', 'Ab Wheel', 'Dual-wheel roller with knee pad. Core work without a gym.', 'fitness', 'strength', 21.0, 53, 'https://images.unsplash.com/photo-1571019613454-1cb2f99b84d4?w=1080&q=80'],
  ['prod-dense-011', 'Fitness Tracker Watch', 'Heart rate, sleep, and 7-day battery. Water resistant.', 'fitness', 'cardio', 89.99, 37, 'https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?w=1080&q=80'],
  ['prod-dense-012', 'Whey Isolate 2lb', '25g protein per scoop. Vanilla. Mixes smooth.', 'fitness', 'building-muscle', 44.0, 28, 'https://images.unsplash.com/photo-1579722821273-0f6c7d44357c?w=1080&q=80'],
  ['prod-dense-013', 'Massage Gun Mini', 'Quiet percussion massager with 4 heads. Travel case.', 'fitness', 'flexibility', 79.0, 22, 'https://images.unsplash.com/photo-1517836357483-507a3093906b?w=800&q=80'],
  ['prod-dense-014', 'Gym Towel 3-Pack', 'Quick-dry microfiber. Gym bag essential.', 'fitness', 'cardio', 14.99, 120, 'https://images.unsplash.com/photo-1552674601-ca4d8a9ae4c7?w=1080&q=80'],
  ['prod-dense-015', 'Ankle Weights 2kg', 'Velcro pair for walks, pilates, and rehab.', 'fitness', 'losing-weight', 27.5, 46, 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=900&q=80'],

  // Art
  ['prod-dense-016', 'Acrylic Paint Set 24', 'Studio pigments with mixing palette and two brushes.', 'art', 'painting', 36.99, 40, 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=1080&q=80'],
  ['prod-dense-017', 'Sketchbook A4', '120 pages, 160gsm. Holds ink, graphite, and light wash.', 'art', 'drawing', 18.0, 88, 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=1080&q=80'],
  ['prod-dense-018', 'Graphite Pencil Set', '12 grades from 6H to 8B. Sharpener and kneaded eraser.', 'art', 'drawing', 12.5, 102, 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=900&q=80'],
  ['prod-dense-019', 'Watercolor Travel Set', '24 pans, water brush, and folding palette.', 'art', 'painting', 29.99, 35, 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=1080&q=80'],
  ['prod-dense-020', 'Beginner Acoustic Guitar', 'Full-size spruce top with gig bag, strap, and tuner.', 'art', 'guitar', 189.0, 11, 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=1080&q=80'],
  ['prod-dense-021', '61-Key Keyboard', 'Weighted-feel keys, 200 voices, and lesson mode.', 'art', 'piano', 159.0, 16, 'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=1080&q=80'],
  ['prod-dense-022', 'Violin Starter Outfit', '4/4 violin, bow, case, and rosin. Setup ready.', 'art', 'violin', 149.0, 9, 'https://images.unsplash.com/photo-1612225330812-01a9c6b355ec?w=1080&q=80'],
  ['prod-dense-023', 'Prime Lens 50mm', 'Fast portrait lens for mirrorless bodies. Soft bokeh.', 'art', 'photography', 249.0, 7, 'https://images.unsplash.com/photo-1452587925148-ce544e77e70d?w=1080&q=80'],
  ['prod-dense-024', 'Film Camera Starter', '35mm point-and-shoot with a roll of color film.', 'art', 'photography', 89.0, 18, 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=1080&q=80'],
  ['prod-dense-025', 'Easel Studio Stand', 'H-frame wood easel. Holds canvas up to 48 inches.', 'art', 'painting', 74.5, 13, 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=900&q=80'],
  ['prod-dense-026', 'Calligraphy Set', 'Dip pens, 6 nibs, and two inks. Practice sheets included.', 'art', 'drawing', 32.0, 44, 'https://images.unsplash.com/photo-1455390582262-044cdead277a?w=1080&q=80'],
  ['prod-dense-027', 'Ukulele Concert', 'Mahogany concert uke with tuner and extra strings.', 'art', 'guitar', 69.0, 21, 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=900&q=80'],
  ['prod-dense-028', 'Piano Bench', 'Padded bench with storage for sheet music.', 'art', 'piano', 59.99, 15, 'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=900&q=80'],

  // Nutrition
  ['prod-dense-029', 'Meal Prep Containers 20pc', 'BPA-free, microwave and dishwasher safe. Leak-resistant lids.', 'nutrition', 'meal-planning', 24.99, 70, 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=1080&q=80'],
  ['prod-dense-030', 'Chef Knife 8-Inch', 'German stainless steel. Full tang, balanced handle.', 'nutrition', 'cooking', 64.0, 26, 'https://images.unsplash.com/photo-1593618998160-e34014e67546?w=1080&q=80'],
  ['prod-dense-031', 'Cast Iron Skillet', '12-inch pre-seasoned skillet. Stovetop to oven.', 'nutrition', 'cooking', 39.99, 33, 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=1080&q=80'],
  ['prod-dense-032', 'Digital Air Fryer', '5.8-quart basket. 75% less oil, 8 presets.', 'nutrition', 'healthy-eating', 92.0, 19, 'https://images.unsplash.com/photo-1585518419759-7fe2e0fbf8d4?w=1080&q=80'],
  ['prod-dense-033', 'High-Speed Blender', '1200W, smoothie and soup programs. Tamper included.', 'nutrition', 'healthy-eating', 129.0, 12, 'https://images.unsplash.com/photo-1570222094114-d058a192266c?w=1080&q=80'],
  ['prod-dense-034', 'Food Scale', '0.1g precision. Tare and ml modes.', 'nutrition', 'weight-management', 21.5, 81, 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=1080&q=80'],
  ['prod-dense-035', 'Insulated Lunch Tote', 'Keeps meals cold 6 hours. Fits four containers.', 'nutrition', 'meal-planning', 28.0, 54, 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=1080&q=80'],
  ['prod-dense-036', 'Herb Garden Kit', 'Basil, mint, and parsley. Indoor pots and soil.', 'nutrition', 'cooking', 26.99, 39, 'https://images.unsplash.com/photo-1466692476866-aef1dfb1e735?w=1080&q=80'],
  ['prod-dense-037', 'Protein Shaker 700ml', 'Leak-proof with mixing ball. Dishwasher safe.', 'nutrition', 'healthy-eating', 12.99, 140, 'https://images.unsplash.com/photo-1579722820308-d74e571900a9?w=1080&q=80'],
  ['prod-dense-038', 'Olive Oil Extra Virgin', '500ml cold-pressed. Peppery finish for salads.', 'nutrition', 'healthy-eating', 16.5, 60, 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=1080&q=80'],
  ['prod-dense-039', 'Cutting Board Set', 'Three sizes, juice groove, non-slip feet.', 'nutrition', 'cooking', 34.0, 47, 'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=1080&q=80'],
  ['prod-dense-040', 'Stand Mixer 5qt', 'Planetary mixing, dough hook, and whisk.', 'nutrition', 'cooking', 239.0, 8, 'https://images.unsplash.com/photo-1570222094114-d058a192266c?w=900&q=80'],

  // Mindset
  ['prod-dense-041', 'Meditation Cushion', 'Buckwheat zafu. Removable washable cover.', 'mindset', 'meditation', 48.0, 29, 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=1080&q=80'],
  ['prod-dense-042', 'Essential Oil Diffuser', 'Ultrasonic mist, 7-color light, 4-hour timer.', 'mindset', 'meditation', 32.99, 51, 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=1080&q=80'],
  ['prod-dense-043', 'Gratitude Journal', 'Daily prompts, 90 days. Cloth hardcover.', 'mindset', 'positive-thinking', 18.99, 77, 'https://images.unsplash.com/photo-1517842645767-c639042777db?w=1080&q=80'],
  ['prod-dense-044', 'Breathwork Cards', '40 illustrated practices for calm and focus.', 'mindset', 'stress-management', 22.0, 43, 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=1080&q=80'],
  ['prod-dense-045', 'Affirmation Deck', '52 cards. Morning ritual in a tin.', 'mindset', 'self-confidence', 19.5, 58, 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=1080&q=80'],
  ['prod-dense-046', 'Singing Bowl', 'Hand-hammered brass with mallet and cushion.', 'mindset', 'meditation', 54.0, 17, 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=900&q=80'],
  ['prod-dense-047', 'Lavender Roll-On', 'Calming blend for pulse points. 10ml.', 'mindset', 'stress-management', 14.0, 86, 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=900&q=80'],
  ['prod-dense-048', 'Mindful Coloring Book', 'Adult patterns, thick paper, tear-out pages.', 'mindset', 'positive-thinking', 13.99, 64, 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=900&q=80'],

  // Discipline
  ['prod-dense-049', 'Habit Tracker Notebook', 'Undated weekly grids. 12 months of streaks.', 'discipline', 'habit-building', 16.0, 91, 'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=1080&q=80'],
  ['prod-dense-050', 'Analog Timer', '60-minute focus dial. No screens, no buzz.', 'discipline', 'time-management', 24.5, 38, 'https://images.unsplash.com/photo-1501139083538-0139583c060f?w=1080&q=80'],
  ['prod-dense-051', 'E-Reader 7-Inch', 'Warm backlight, weeks of battery, 8GB.', 'discipline', 'habit-building', 119.0, 20, 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=1080&q=80'],
  ['prod-dense-052', 'Desk Planner Board', 'Weekly dry-erase with magnets. A3 size.', 'discipline', 'goal-setting', 29.99, 34, 'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=900&q=80'],
  ['prod-dense-053', 'Noise-Cancel Headphones', 'Over-ear, 30-hour battery. Deep-work kit.', 'discipline', 'productivity', 179.0, 15, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1080&q=80'],
  ['prod-dense-054', 'Clip Reading Light', 'Warm/cool LEDs. USB-C rechargeable.', 'discipline', 'productivity', 18.5, 72, 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=1080&q=80'],
  ['prod-dense-055', 'Wooden Book Stand', 'Adjustable angle. Hands-free recipes and scores.', 'discipline', 'productivity', 27.0, 41, 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=900&q=80'],
  ['prod-dense-056', 'Goal Cards Kit', 'Quarterly goal cards plus progress stickers.', 'discipline', 'goal-setting', 15.99, 55, 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1080&q=80'],

  // Martial arts
  ['prod-dense-057', 'Boxing Gloves 12oz', 'Multi-layer foam, wrist wrap. Pair.', 'martial-arts', 'boxing', 49.0, 31, 'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=1080&q=80'],
  ['prod-dense-058', 'Hand Wraps 4.5m', 'Elastic cotton. Two pairs.', 'martial-arts', 'boxing', 12.99, 98, 'https://images.unsplash.com/photo-1517438476312-10d79c077509?w=1080&q=80'],
  ['prod-dense-059', 'BJJ Gi White A2', 'Pearl weave jacket, reinforced knees.', 'martial-arts', 'jiu-jitsu', 119.0, 14, 'https://images.unsplash.com/photo-1555597673-b21d5c935865?w=1080&q=80'],
  ['prod-dense-060', 'Karate Gi Lightweight', 'Student cut, belt included. Wash-and-wear.', 'martial-arts', 'karate', 64.5, 22, 'https://images.unsplash.com/photo-1555597673-b21d5c935865?w=900&q=80'],
  ['prod-dense-061', 'Focus Mitts Pair', 'Curved pads for pad work. Velcro straps.', 'martial-arts', 'boxing', 36.0, 27, 'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=900&q=80'],
  ['prod-dense-062', 'Taekwondo Chest Guard', 'Reversible red/blue. Youth and adult sizes.', 'martial-arts', 'taekwondo', 44.0, 18, 'https://images.unsplash.com/photo-1517438476312-10d79c077509?w=900&q=80'],
  ['prod-dense-063', 'Mouthguard Custom-Fit', 'Boil-and-bite, case included.', 'martial-arts', 'boxing', 11.5, 84, 'https://images.unsplash.com/photo-1571019613454-1cb2f99b84d4?w=800&q=80'],
  ['prod-dense-064', 'Jump Mat 20mm', 'Home striking mat. High-density foam.', 'martial-arts', 'karate', 79.0, 10, 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=900&q=80'],

  // Language
  ['prod-dense-065', 'Spanish Flashcard Box', '1000 frequency words with audio QR.', 'language', 'spanish', 24.0, 49, 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=1080&q=80'],
  ['prod-dense-066', 'French Conversation Workbook', 'A2–B1 dialogues and answer key.', 'language', 'french', 21.99, 36, 'https://images.unsplash.com/photo-14565130808-af504b27c6a6?w=1080&q=80'],
  ['prod-dense-067', 'Mandarin Character Practice', 'Grid paper pad + stroke-order guide.', 'language', 'mandarin', 17.5, 42, 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=900&q=80'],
  ['prod-dense-068', 'Japanese Hiragana Kit', 'Mnemonics deck and writing sheets.', 'language', 'japanese', 19.0, 40, 'https://images.unsplash.com/photo-1528164344705-47542687000d?w=1080&q=80'],
  ['prod-dense-069', 'Language Course 12mo', 'Interactive lessons. Unlock all four tracks.', 'language', 'spanish', 79.0, 999, 'https://images.unsplash.com/photo-14565130808-af504b27c6a6?w=900&q=80'],
  ['prod-dense-070', 'Travel Phrase Book Set', 'Pocket books: ES, FR, JP, ZH.', 'language', 'french', 28.0, 33, 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=900&q=80'],

  // Coding
  ['prod-dense-071', 'Mechanical Keyboard', 'Hot-swap, tactile switches, USB-C.', 'coding', 'web-development', 129.0, 18, 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=1080&q=80'],
  ['prod-dense-072', 'Laptop Stand Aluminum', 'Ergonomic height, fold-flat travel.', 'coding', 'web-development', 42.0, 45, 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1080&q=80'],
  ['prod-dense-073', 'USB-C Hub 7-in-1', 'HDMI 4K, SD, two USB-A, 100W pass-through.', 'coding', 'mobile-development', 39.99, 52, 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1080&q=80'],
  ['prod-dense-074', 'Algorithm Whiteboard', 'Desktop 12x16 inch with markers.', 'coding', 'algorithms', 27.0, 29, 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1080&q=80'],
  ['prod-dense-075', 'Data Notebook', 'Dot-grid for sketches, SQL, and plots.', 'coding', 'data-science', 14.5, 67, 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1080&q=80'],
  ['prod-dense-076', 'Monitor Light Bar', 'Bias lighting, no screen glare.', 'coding', 'web-development', 49.0, 24, 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=900&q=80'],
  ['prod-dense-077', 'Dev Sticker Pack', '40 vinyl stickers. Laptop armor.', 'coding', 'mobile-development', 9.99, 200, 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=900&q=80'],

  // Sustainability
  ['prod-dense-078', 'Reusable Water Bottle 1L', 'Insulated steel. 24h cold, 12h hot.', 'sustainability', 'eco-friendly-products', 32.0, 88, 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=1080&q=80'],
  ['prod-dense-079', 'Beeswax Wrap 5-Pack', 'Cover bowls and leftovers. Wash and reuse.', 'sustainability', 'zero-waste', 18.99, 61, 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=1080&q=80'],
  ['prod-dense-080', 'Tote Bag Organic', 'Heavy canvas, long handles. Everyday carry.', 'sustainability', 'sustainable-living', 14.0, 110, 'https://images.unsplash.com/photo-1597484662317-4c73d5f29219?w=1080&q=80'],
  ['prod-dense-081', 'Bamboo Cutlery Set', 'Fork, knife, spoon, straw, pouch.', 'sustainability', 'zero-waste', 12.5, 95, 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=900&q=80'],
  ['prod-dense-082', 'Solar Phone Charger', '21W foldable panel with USB-C.', 'sustainability', 'renewable-energy', 59.0, 23, 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=1080&q=80'],
  ['prod-dense-083', 'Compost Bin Countertop', 'Charcoal filter lid. 3.5L.', 'sustainability', 'conservation', 29.99, 31, 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=1080&q=80'],
  ['prod-dense-084', 'Bike Lights USB', 'Front and rear set. 8-hour runtime.', 'sustainability', 'sustainable-transport', 24.0, 48, 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=1080&q=80'],
  ['prod-dense-085', 'Hiking Boots Waterproof', 'Vibram-style sole, ankle support.', 'sustainability', 'sustainable-living', 134.0, 16, 'https://images.unsplash.com/photo-1520219306100-ec4cdc91b1f1?w=1080&q=80'],
  ['prod-dense-086', 'Travel Backpack 40L', 'Laptop sleeve, rain cover, lockable zips.', 'sustainability', 'sustainable-living', 84.0, 21, 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=1080&q=80'],
  ['prod-dense-087', 'Seed Starter Kit', 'Native wildflower mix and biodegradable pots.', 'sustainability', 'conservation', 19.5, 37, 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=900&q=80'],
  ['prod-dense-088', 'LED Desk Lamp Solar', 'Daylight LEDs plus small solar panel.', 'sustainability', 'green-building', 45.0, 19, 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=900&q=80'],
  ['prod-dense-089', 'Carbon Offset Pack', 'Support a verified tree-planting project (10 trees).', 'sustainability', 'carbon-footprint', 25.0, 500, 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=800&q=80'],

  // Wellness
  ['prod-dense-090', 'Weighted Blanket 7kg', 'Cotton cover, glass-bead fill. Queen size.', 'wellness', 'sleep', 89.0, 14, 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=1080&q=80'],
  ['prod-dense-091', 'Silk Sleep Mask', 'Contoured, no-pressure on eyes. Washable.', 'wellness', 'sleep', 22.0, 73, 'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=1080&q=80'],
  ['prod-dense-092', 'Bath Soak Lavender', '1kg Epsom + botanicals. 12 soaks.', 'wellness', 'self-care', 18.5, 56, 'https://images.unsplash.com/photo-1600334129128-685c5582fd35?w=1080&q=80'],
  ['prod-dense-093', 'Daylight Lamp', '10,000 lux. 30-minute morning ritual.', 'wellness', 'mental-health', 69.0, 18, 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=800&q=80'],
  ['prod-dense-094', 'Journal + Pen Set', 'Lined cream pages, gel pen, ribbon marker.', 'wellness', 'self-care', 21.0, 62, 'https://images.unsplash.com/photo-1517842645767-c639042777db?w=900&q=80'],
  ['prod-dense-095', 'Work-From-Home Kit', 'Wrist rest, laptop riser, and stretch cards.', 'wellness', 'work-life-balance', 47.0, 25, 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&q=80'],
  ['prod-dense-096', 'Herbal Tea Sampler', '12 sachets: calm, focus, and sleep blends.', 'wellness', 'self-care', 16.99, 80, 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=1080&q=80'],
  ['prod-dense-097', 'White Noise Machine', '18 sounds, night light, USB-C.', 'wellness', 'sleep', 39.99, 28, 'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=900&q=80'],

  // Finance
  ['prod-dense-098', 'Budget Envelope Set', '12 cash envelopes + tracker cards.', 'finance', 'budgeting', 14.99, 70, 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1080&q=80'],
  ['prod-dense-099', 'Investing Starter Guide', 'Paperback primer plus worksheet pack.', 'finance', 'investing', 19.0, 44, 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1080&q=80'],
  ['prod-dense-100', 'Savings Jar Trio', 'Labeled glass jars: spend, save, give.', 'finance', 'saving', 27.5, 39, 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=1080&q=80'],
  ['prod-dense-101', 'Expense Tracker Book', 'Monthly ledgers, 18 months.', 'finance', 'financial-literacy', 15.5, 58, 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1080&q=80'],
  ['prod-dense-102', 'Receipt Folder A5', 'Expanding file for tax season.', 'finance', 'budgeting', 12.0, 66, 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=1080&q=80'],
  ['prod-dense-103', 'Coin Bank Smart', 'Counts coins as you drop them. LCD total.', 'finance', 'saving', 34.0, 22, 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=900&q=80'],
];

const lines = [];
lines.push('-- Dense marketplace seed: catalog owned by demo-core-business');
lines.push('-- Seller login: business@growl.app / GrowlDemo123!');
lines.push('-- Generated by scripts/generate-dense-products-seed.js');
lines.push('');
lines.push('PRAGMA foreign_keys = ON;');
lines.push('');

const header = [
  'INSERT OR REPLACE INTO products (id, user_id, name, description, category, subcategory, price, stock, image_url, images, metadata, created_at, updated_at) VALUES',
];

const rows = CATALOG.map(([id, name, desc, cat, sub, price, stock, image], i) => {
  const images = JSON.stringify([image]);
  const tags = JSON.stringify({ tags: [cat, sub], seller: 'Demo Business' });
  const days = (i % 40) + 1;
  return `  ('${id}', '${OWNER}', '${esc(name)}', '${esc(desc)}', '${cat}', '${sub}', ${price}, ${stock}, '${image}', '${esc(images)}', '${esc(tags)}', datetime('now', '-${days} days'), datetime('now'))`;
});

for (const batch of chunk(rows, 12)) {
  lines.push(...header);
  lines.push(batch.join(',\n') + ';');
  lines.push('');
}

const out = path.join(__dirname, 'seed-demo-products-dense.sql');
fs.writeFileSync(out, lines.join('\n') + '\n', 'utf8');
console.log('Wrote', out);
console.log(`Products: ${CATALOG.length} (owner ${OWNER})`);
