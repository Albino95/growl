#!/usr/bin/env node

/**
 * Seed script to add sample products to the marketplace
 * Run with: node scripts/seed-products.js
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const BASE_URL = process.env.API_BASE_URL || 'https://growl-backend.albino-ndreu.workers.dev/api/v1';

// Simple fetch implementation
function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = protocol.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          json: async () => {
            try {
              return JSON.parse(data);
            } catch (e) {
              return { text: data };
            }
          },
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

// Sample products to seed
const sampleProducts = [
  {
    name: 'Premium Fitness Tracker',
    description: 'Advanced fitness tracker with heart rate monitor, step counter, and sleep tracking. Waterproof design perfect for all your workouts.',
    category: 'fitness',
    subcategory: 'losing-weight',
    price: 99.99,
    stock: 50,
    image_url: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b84d4?w=800&h=600&fit=crop',
  },
  {
    name: 'Yoga Mat Pro',
    description: 'Professional grade yoga mat with superior grip and cushioning. Eco-friendly materials, perfect for all yoga styles.',
    category: 'fitness',
    subcategory: 'flexibility',
    price: 49.99,
    stock: 75,
    image_url: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&h=600&fit=crop',
  },
  {
    name: 'Digital Piano Course',
    description: 'Complete online piano course for beginners. Learn at your own pace with video lessons, sheet music, and practice exercises.',
    category: 'art',
    subcategory: 'piano',
    price: 79.99,
    stock: 100,
    image_url: 'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=800&h=600&fit=crop',
  },
  {
    name: 'Meal Prep Containers Set',
    description: 'BPA-free meal prep containers with leak-proof lids. Perfect for meal planning and portion control. Microwave and dishwasher safe.',
    category: 'nutrition',
    subcategory: 'meal-planning',
    price: 29.99,
    stock: 200,
    image_url: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800&h=600&fit=crop',
  },
  {
    name: 'Meditation App Premium',
    description: 'Premium subscription to guided meditation app. Access to hundreds of sessions, sleep stories, and mindfulness exercises.',
    category: 'mindset',
    subcategory: 'meditation',
    price: 9.99,
    stock: 1000,
    image_url: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&h=600&fit=crop',
  },
  {
    name: 'Habit Tracker Journal',
    description: 'Beautiful physical journal for tracking habits, goals, and daily reflections. Premium paper, perfect binding.',
    category: 'discipline',
    subcategory: 'habit-building',
    price: 19.99,
    stock: 150,
    image_url: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=800&h=600&fit=crop',
  },
  {
    name: 'Resistance Bands Set',
    description: 'Professional resistance bands set with 5 different resistance levels. Perfect for home workouts and travel.',
    category: 'fitness',
    subcategory: 'strength-training',
    price: 34.99,
    stock: 120,
    image_url: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b84d4?w=800&h=600&fit=crop',
  },
  {
    name: 'Healthy Cookbook Collection',
    description: 'Digital cookbook with 200+ healthy recipes. Includes meal plans, shopping lists, and nutritional information.',
    category: 'nutrition',
    subcategory: 'healthy-eating',
    price: 24.99,
    stock: 500,
    image_url: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800&h=600&fit=crop',
  },
];

async function seedProducts() {
  console.log('🌱 Starting to seed products...\n');

  // First, try to sign in or sign up as a business account
  // For this script, we'll need a business account token
  // You'll need to provide a business account email/password or token
  
  const businessEmail = process.env.BUSINESS_EMAIL || 'business@growl.app';
  const businessPassword = process.env.BUSINESS_PASSWORD || 'business123';
  
  console.log(`📝 Using business account: ${businessEmail}`);
  
  // Sign in to get token
  let token = null;
  try {
    const signInResponse = await fetch(`${BASE_URL}/auth/sign-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: businessEmail,
        password: businessPassword,
      }),
    });

    const signInData = await signInResponse.json();
    if (signInData.success && signInData.data?.token) {
      token = signInData.data.token;
      console.log('✅ Authenticated successfully\n');
    } else {
      console.log('⚠️  Could not authenticate. Trying to sign up...\n');
      // Try sign up
      const signUpResponse = await fetch(`${BASE_URL}/auth/sign-up`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: businessEmail,
          password: businessPassword,
          username: 'business',
        }),
      });
      const signUpData = await signUpResponse.json();
      if (signUpData.success && signUpData.data?.token) {
        token = signUpData.data.token;
        const userId = signUpData.data.user?.id;
        console.log('✅ Account created and authenticated\n');
        
        // Mark user as business - we'll need to do this via direct SQL
        // For now, print instructions
        if (userId) {
          console.log('⚠️  IMPORTANT: Mark this user as business in the database:');
          console.log(`   npx wrangler d1 execute growl-db --command "UPDATE users SET is_business = 1 WHERE id = '${userId}';" --remote\n`);
          console.log('   Or run the SQL seed script instead:');
          console.log('   npx wrangler d1 execute growl-db --file=scripts/seed-products-sql.sql --remote\n');
        }
      }
    }
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
    console.log('\n💡 Tip: Make sure you have a business account or set BUSINESS_EMAIL and BUSINESS_PASSWORD env vars\n');
    return;
  }

  if (!token) {
    console.log('❌ Could not get authentication token. Exiting.\n');
    return;
  }

  // Check if user is business, if not, try to mark them
  try {
    const profileResponse = await fetch(`${BASE_URL}/profile`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    const profileData = await profileResponse.json();
    
    if (profileData.success && profileData.data) {
      if (!profileData.data.is_business) {
        console.log('⚠️  User is not marked as business. Marking now...\n');
        console.log('💡 Run this command to mark user as business:');
        console.log(`   npx wrangler d1 execute growl-db --command "UPDATE users SET is_business = 1 WHERE email = '${businessEmail}';" --remote\n`);
        console.log('   Or use: node scripts/mark-business.js business@growl.app\n');
        console.log('   Then run this script again.\n');
        return;
      } else {
        console.log('✅ User is marked as business\n');
      }
    }
  } catch (error) {
    console.log('⚠️  Could not verify business status. Proceeding anyway...\n');
  }

  // Create products
  let successCount = 0;
  let failCount = 0;

  for (const product of sampleProducts) {
    try {
      const response = await fetch(`${BASE_URL}/marketplace/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(product),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        console.log(`✅ Created: ${product.name}`);
        successCount++;
      } else {
        console.log(`❌ Failed: ${product.name} - ${data.error?.message || 'Unknown error'}`);
        failCount++;
      }
    } catch (error) {
      console.log(`❌ Error creating ${product.name}:`, error.message);
      failCount++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   📦 Total: ${sampleProducts.length}\n`);

  if (successCount > 0) {
    console.log('🎉 Products seeded successfully! Check the marketplace now.\n');
  }
}

// Run the script
seedProducts().catch(console.error);
