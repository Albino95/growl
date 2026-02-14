#!/usr/bin/env node

/**
 * Mark a user as business account
 * Usage: node scripts/mark-business.js <email>
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const { execSync } = require('child_process');

const BASE_URL = process.env.API_BASE_URL || 'https://growl-backend.albino-ndreu.workers.dev/api/v1';
const email = process.argv[2] || 'business@growl.app';

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

async function markAsBusiness() {
  console.log(`🔧 Marking user as business: ${email}\n`);

  try {
    // First, get user ID from database
    console.log('📋 Finding user in database...');
    const findUserCmd = `npx wrangler d1 execute growl-db --command "SELECT id, email, is_business FROM users WHERE email = '${email}';" --remote`;
    
    try {
      const output = execSync(findUserCmd, { encoding: 'utf-8' });
      console.log('User found:', output);
      
      // Extract user ID from output (this is a simple approach)
      // Better to parse JSON if wrangler outputs it
      const userIdMatch = output.match(/id["\s:]+([^"}\s]+)/);
      if (userIdMatch) {
        const userId = userIdMatch[1];
        console.log(`\n✅ Found user ID: ${userId}`);
        
        // Mark as business
        console.log('\n🔧 Marking as business...');
        const updateCmd = `npx wrangler d1 execute growl-db --command "UPDATE users SET is_business = 1 WHERE id = '${userId}';" --remote`;
        execSync(updateCmd, { encoding: 'utf-8' });
        
        console.log('✅ User marked as business!\n');
        return true;
      } else {
        console.log('❌ Could not extract user ID from output');
        console.log('💡 Try running manually:');
        console.log(`   npx wrangler d1 execute growl-db --command "UPDATE users SET is_business = 1 WHERE email = '${email}';" --remote\n`);
        return false;
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
      console.log('\n💡 Try running manually:');
      console.log(`   npx wrangler d1 execute growl-db --command "UPDATE users SET is_business = 1 WHERE email = '${email}';" --remote\n`);
      return false;
    }
  } catch (error) {
    console.error('❌ Failed:', error.message);
    return false;
  }
}

markAsBusiness();
