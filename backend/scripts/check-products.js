#!/usr/bin/env node

/**
 * Diagnostic script to check products in database
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const BASE_URL = process.env.API_BASE_URL || 'https://growl-backend.albino-ndreu.workers.dev/api/v1';

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
          text: async () => data,
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

async function checkProducts() {
  console.log('🔍 Checking products in marketplace...\n');
  console.log(`API URL: ${BASE_URL}/marketplace/products\n`);

  try {
    const response = await fetch(`${BASE_URL}/marketplace/products`);
    const data = await response.json();
    
    console.log('📊 API Response:');
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (data.success && data.data) {
      const products = data.data.products || [];
      console.log(`\n✅ Found ${products.length} products\n`);
      
      if (products.length > 0) {
        console.log('Products:');
        products.forEach((p, i) => {
          console.log(`  ${i + 1}. ${p.name} - $${p.price} (Stock: ${p.stock})`);
        });
      } else {
        console.log('⚠️  No products found in database');
        console.log('\n💡 To add products, run:');
        console.log('   node scripts/seed-products.js');
        console.log('   OR');
        console.log('   npx wrangler d1 execute growl-db --file=scripts/seed-products-sql.sql --remote');
      }
    } else {
      console.log('\n❌ API returned error:', data.error);
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.log('\n💡 Check:');
    console.log('   1. Backend is deployed and running');
    console.log('   2. Database migrations are run');
    console.log('   3. API URL is correct');
  }
}

checkProducts();
