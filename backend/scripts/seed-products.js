/**
 * Seed products script - aligned with frontend/src/data/categories.ts
 * Run with: node scripts/seed-products.js
 */

const https = require('https');
const http = require('http');

const API_BASE_URL = process.env.API_BASE_URL || 'https://growl-backend.albino-ndreu.workers.dev/api/v1';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

const products = [
  // Fitness
  { name: 'Premium Yoga Mat', description: 'Non-slip, eco-friendly yoga mat perfect for all practice levels. Extra thick for comfort.', category: 'fitness', subcategory: 'flexibility', price: 34.99, stock: 45 },
  { name: 'Resistance Bands Set', description: 'Complete set of 5 resistance bands with different resistance levels. Perfect for home workouts.', category: 'fitness', subcategory: 'strength', price: 29.99, stock: 23 },
  { name: 'Protein Powder 2lb', description: 'Whey protein isolate with 25g protein per serving. Vanilla flavor.', category: 'fitness', subcategory: 'building-muscle', price: 45.5, stock: 8 },
  { name: 'Fitness Tracker Watch', description: 'Smart fitness tracker with heart rate monitor, sleep tracking, and 7-day battery life.', category: 'fitness', subcategory: 'cardio', price: 89.99, stock: 67 },
  { name: 'Adjustable Dumbbells', description: 'Space-saving adjustable dumbbells from 5-50lbs each. Perfect for home gym.', category: 'fitness', subcategory: 'strength', price: 199.99, stock: 12 },

  // Art
  { name: 'Acrylic Paint Set', description: 'Professional 24-color acrylic paint set with brushes included. High-quality pigments.', category: 'art', subcategory: 'painting', price: 39.99, stock: 34 },
  { name: 'Sketchbook Pro', description: 'Premium sketchbook with 120 pages of high-quality paper. Perfect for all drawing mediums.', category: 'art', subcategory: 'drawing', price: 24.99, stock: 56 },
  { name: 'Digital Drawing Tablet', description: '10-inch drawing tablet with pressure sensitivity. Perfect for digital art creation.', category: 'art', subcategory: 'drawing', price: 149.99, stock: 18 },
  { name: 'Watercolor Paint Set', description: 'Professional watercolor set with 36 vibrant colors and mixing palette.', category: 'art', subcategory: 'painting', price: 49.99, stock: 28 },
  { name: 'Beginner Guitar Starter Pack', description: 'Complete starter pack with acoustic guitar, case, picks, and beginner guide book.', category: 'art', subcategory: 'guitar', price: 199.99, stock: 15 },
  { name: 'Electronic Keyboard 61 Keys', description: 'Full-size 61-key keyboard with 200 sounds and learning features. Perfect for beginners.', category: 'art', subcategory: 'piano', price: 149.99, stock: 22 },

  // Mindset & wellness
  { name: 'Meditation Cushion Set', description: 'Premium zafu and zabuton meditation cushions. Comfortable and supportive.', category: 'mindset', subcategory: 'meditation', price: 59.99, stock: 27 },
  { name: 'Essential Oil Diffuser', description: 'Ultrasonic essential oil diffuser with LED lights. Perfect for meditation spaces.', category: 'mindset', subcategory: 'meditation', price: 34.99, stock: 41 },
  { name: 'Gratitude Journal', description: 'Beautiful hardcover journal with daily prompts for gratitude and reflection.', category: 'mindset', subcategory: 'positive-thinking', price: 19.99, stock: 68 },
  { name: 'Weighted Blanket 15lbs', description: 'Premium weighted blanket for better sleep and reduced anxiety. 100% cotton cover.', category: 'wellness', subcategory: 'sleep', price: 89.99, stock: 14 },

  // Nutrition
  { name: 'Professional Chef Knife Set', description: '5-piece premium stainless steel knife set with wooden block. Razor sharp.', category: 'nutrition', subcategory: 'cooking', price: 129.99, stock: 16 },
  { name: 'Stand Mixer', description: 'Powerful 5-quart stand mixer with multiple attachments. Perfect for baking.', category: 'nutrition', subcategory: 'cooking', price: 249.99, stock: 9 },
  { name: 'Meal Prep Containers Set', description: 'BPA-free 20-piece meal prep container set. Microwave and dishwasher safe.', category: 'nutrition', subcategory: 'meal-planning', price: 24.99, stock: 52 },
  { name: 'Air Fryer', description: '5.8-quart digital air fryer. Healthier cooking with 75% less oil.', category: 'nutrition', subcategory: 'healthy-eating', price: 89.99, stock: 38 },

  // Language & discipline
  { name: 'E-Reader', description: '7-inch e-reader with backlight. Store thousands of books. Perfect for reading anywhere.', category: 'discipline', subcategory: 'habit-building', price: 119.99, stock: 25 },
  { name: 'Reading Light', description: 'Adjustable LED reading light with clip. Perfect for bedtime reading.', category: 'discipline', subcategory: 'productivity', price: 19.99, stock: 73 },
  { name: 'Language Learning Course', description: 'Complete online language learning course with interactive lessons. 12 languages available.', category: 'language', subcategory: 'spanish', price: 79.99, stock: 999 },
  { name: 'Book Stand', description: 'Adjustable wooden book stand. Perfect for reading and studying hands-free.', category: 'discipline', subcategory: 'productivity', price: 29.99, stock: 44 },

  // Sustainability
  { name: 'Travel Backpack 40L', description: 'Waterproof travel backpack with laptop compartment. Perfect for adventures.', category: 'sustainability', subcategory: 'sustainable-living', price: 79.99, stock: 29 },
  { name: 'Hiking Boots', description: 'Waterproof hiking boots with excellent grip. Comfortable for long treks.', category: 'sustainability', subcategory: 'sustainable-living', price: 129.99, stock: 18 },
  { name: 'Portable Water Filter', description: 'Compact water filter for safe drinking water anywhere. Perfect for camping.', category: 'sustainability', subcategory: 'eco-friendly-products', price: 39.99, stock: 36 },
  { name: 'Gardening Tool Set', description: 'Complete 8-piece gardening tool set with carrying case. Perfect for beginners.', category: 'sustainability', subcategory: 'conservation', price: 49.99, stock: 21 },
];

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(AUTH_TOKEN && { Authorization: `Bearer ${AUTH_TOKEN}` }),
        ...(options.headers || {}),
      },
    };

    const req = protocol.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }

    req.end();
  });
}

async function seedProducts() {
  console.log('Starting product seeding...\n');
  console.log(`API Base URL: ${API_BASE_URL}\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    console.log(`[${i + 1}/${products.length}] Creating: ${product.name}...`);

    try {
      const response = await makeRequest(`${API_BASE_URL}/marketplace/products`, {
        method: 'POST',
        body: product,
      });

      if (response.status === 201 || response.status === 200) {
        console.log(`  OK ID: ${response.data?.data?.id || 'N/A'}`);
        successCount++;
      } else {
        console.log(`  Failed: ${response.status} - ${JSON.stringify(response.data)}`);
        errorCount++;
      }
    } catch (error) {
      console.log(`  Error: ${error.message}`);
      errorCount++;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(`\nSeeding complete!`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Errors: ${errorCount}`);
  console.log(`   Total: ${products.length}`);
}

seedProducts().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
