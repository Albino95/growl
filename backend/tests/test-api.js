#!/usr/bin/env node

/**
 * Backend API Test Script
 * Tests all backend endpoints to verify they're working correctly
 */

// Use native fetch (Node 18+) or fallback to https module
const https = require('https');
const http = require('http');
const { URL } = require('url');

// Simple fetch implementation using Node.js built-in modules
async function fetch(url, options = {}) {
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

const BASE_URL = process.env.API_BASE_URL || 'https://growl-backend.albino-ndreu.workers.dev/api/v1';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

let authToken = null;
let testUserId = null;
let testPostId = null;

// Test results
const results = {
  passed: 0,
  failed: 0,
  tests: [],
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name, passed, message = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  const color = passed ? 'green' : 'red';
  log(`  ${status}: ${name}${message ? ` - ${message}` : ''}`, color);
  
  results.tests.push({ name, passed, message });
  if (passed) {
    results.passed++;
  } else {
    results.failed++;
  }
}

async function request(method, path, body = null, token = null) {
  const url = `${BASE_URL}${path}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      // If JSON parsing fails, try to get text
      data = { text: await response.text() };
    }
    return {
      status: response.status,
      ok: response.ok,
      data,
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      error: error.message,
    };
  }
}

async function testHealthCheck() {
  log('\n📊 Testing Health Check Endpoint', 'cyan');
  
  const result = await request('GET', '/health');
  const passed = result.ok && result.data?.success && result.data?.data?.status === 'ok';
  logTest('Health Check', passed, `Status: ${result.status}, Database: ${result.data?.data?.database}`);
  
  return passed;
}

async function testSignUp() {
  log('\n👤 Testing User Sign Up', 'cyan');
  
  const email = `test-${Date.now()}@example.com`;
  const password = 'TestPassword123!';
  
  const result = await request('POST', '/auth/sign-up', {
    email,
    password,
    username: 'testuser',
  });
  
  const passed = result.ok && result.data?.success && result.data?.data?.user && result.data?.data?.token;
  
  if (passed) {
    authToken = result.data.data.token;
    testUserId = result.data.data.user.id;
    logTest('Sign Up', true, `User ID: ${testUserId}`);
  } else {
    const errorMsg = result.data?.error?.message || result.data?.error?.code || result.error || `Status: ${result.status}`;
    logTest('Sign Up', false, errorMsg);
    if (result.data?.error?.details) {
      log(`    Details: ${JSON.stringify(result.data.error.details)}`, 'yellow');
    }
    // Show full response for debugging
    if (process.env.DEBUG) {
      log(`    Full response: ${JSON.stringify(result.data, null, 2)}`, 'yellow');
    }
  }
  
  return passed;
}

async function testSignIn() {
  log('\n🔐 Testing User Sign In', 'cyan');
  
  // First create a user
  const email = `test-${Date.now()}@example.com`;
  const password = 'TestPassword123!';
  
  await request('POST', '/auth/sign-up', {
    email,
    password,
    username: 'testuser',
  });
  
  // Then sign in
  const result = await request('POST', '/auth/sign-in', {
    email,
    password,
  });
  
  const passed = result.ok && result.data?.success && result.data?.data?.token;
  
  if (passed) {
    authToken = result.data.data.token;
    testUserId = result.data.data.user.id;
    logTest('Sign In', true, `Token received`);
  } else {
    logTest('Sign In', false, result.data?.error?.message || result.error);
  }
  
  return passed;
}

async function testCreatePost() {
  log('\n📝 Testing Create Post', 'cyan');
  
  if (!authToken) {
    logTest('Create Post', false, 'No auth token');
    return false;
  }
  
  const result = await request('POST', '/feed/posts', {
    caption: 'Test post from API test',
    category: 'fitness',
    subcategory: 'losing-weight',
    image_url: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b84d4?w=800&h=600&fit=crop',
  }, authToken);
  
  const passed = result.ok && result.data?.success && result.data?.data?.id;
  
  if (passed) {
    testPostId = result.data.data.id;
    logTest('Create Post', true, `Post ID: ${testPostId}`);
  } else {
    logTest('Create Post', false, result.data?.error?.message || result.error);
  }
  
  return passed;
}

async function testGetFeed() {
  log('\n📰 Testing Get Feed', 'cyan');
  
  if (!authToken) {
    logTest('Get Feed', false, 'No auth token');
    return false;
  }
  
  const result = await request('GET', '/feed/feed', null, authToken);
  
  const passed = result.ok && result.data?.success && Array.isArray(result.data?.data);
  logTest('Get Feed', passed, `Posts: ${result.data?.data?.length || 0}`);
  
  return passed;
}

async function testGetPost() {
  log('\n📄 Testing Get Post', 'cyan');
  
  if (!testPostId) {
    logTest('Get Post', false, 'No post ID available');
    return false;
  }
  
  const result = await request('GET', `/feed/posts/${testPostId}`);
  
  const passed = result.ok && result.data?.success && result.data?.data?.id === testPostId;
  logTest('Get Post', passed, result.data?.data?.id || 'Not found');
  
  return passed;
}

async function testLikePost() {
  log('\n❤️  Testing Like Post', 'cyan');
  
  if (!authToken || !testPostId) {
    logTest('Like Post', false, 'Missing auth token or post ID');
    return false;
  }
  
  const result = await request('POST', `/feed/posts/${testPostId}/like`, null, authToken);
  
  const passed = result.ok && result.data?.success && typeof result.data?.data?.liked === 'boolean';
  logTest('Like Post', passed, `Liked: ${result.data?.data?.liked}`);
  
  return passed;
}

async function testGetProducts() {
  log('\n🛍️  Testing Get Products', 'cyan');
  
  const result = await request('GET', '/marketplace/products');
  
  // Pass if the endpoint returns successfully, even with 0 products
  // Only fail if there's an actual error (not just empty results)
  const passed = result.ok && result.data?.success;
  const productCount = result.data?.data?.products?.length || result.data?.data?.length || 0;
  
  if (passed) {
    logTest('Get Products', true, `Products: ${productCount}`);
  } else {
    const errorMsg = result.data?.error?.message || result.error || `Status: ${result.status}`;
    logTest('Get Products', false, errorMsg);
    // If it's a database error about missing tables, that's expected before migrations
    if (errorMsg.includes('no such table') || errorMsg.includes('not initialized')) {
      log('    ⚠️  This is expected - run migrations first: npm run migrate', 'yellow');
    }
  }
  
  return passed;
}

async function testGetInstructors() {
  log('\n👨‍🏫 Testing Get Instructors', 'cyan');
  
  const result = await request('GET', '/instructor/instructors');
  
  // Pass if the endpoint returns successfully, even with 0 instructors
  // Only fail if there's an actual error (not just empty results)
  const passed = result.ok && result.data?.success;
  const instructorCount = result.data?.data?.instructors?.length || result.data?.data?.length || 0;
  
  if (passed) {
    logTest('Get Instructors', true, `Instructors: ${instructorCount}`);
  } else {
    const errorMsg = result.data?.error?.message || result.error || `Status: ${result.status}`;
    logTest('Get Instructors', false, errorMsg);
    // If it's a database error about missing tables, that's expected before migrations
    if (errorMsg.includes('no such table')) {
      log('    ⚠️  This is expected - run migrations first: npm run migrate', 'yellow');
    }
  }
  
  return passed;
}

async function testGetProfile() {
  log('\n👤 Testing Get Profile', 'cyan');
  
  if (!authToken) {
    logTest('Get Profile', false, 'No auth token');
    return false;
  }
  
  const result = await request('GET', '/profile', null, authToken);
  
  const passed = result.ok && result.data?.success && result.data?.data?.id;
  logTest('Get Profile', passed, `User: ${result.data?.data?.email || 'N/A'}`);
  
  return passed;
}

async function testUnauthorizedAccess() {
  log('\n🔒 Testing Unauthorized Access', 'cyan');
  
  const result = await request('GET', '/feed/feed');
  
  const passed = !result.ok && result.status === 401;
  logTest('Unauthorized Access', passed, `Status: ${result.status}`);
  
  return passed;
}

async function runAllTests() {
  log('\n🚀 Starting Backend API Tests', 'blue');
  log(`Base URL: ${BASE_URL}\n`, 'yellow');
  
  // Run tests
  await testHealthCheck();
  await testSignUp();
  await testSignIn();
  await testCreatePost();
  await testGetFeed();
  await testGetPost();
  await testLikePost();
  await testGetProducts();
  await testGetInstructors();
  await testGetProfile();
  await testUnauthorizedAccess();
  
  // Summary
  log('\n' + '='.repeat(50), 'cyan');
  log('📊 Test Summary', 'blue');
  log('='.repeat(50), 'cyan');
  log(`✅ Passed: ${results.passed}`, 'green');
  log(`❌ Failed: ${results.failed}`, 'red');
  log(`📈 Total: ${results.passed + results.failed}`, 'yellow');
  log('='.repeat(50), 'cyan');
  
  if (results.failed === 0) {
    log('\n🎉 All tests passed!', 'green');
    process.exit(0);
  } else {
    log('\n⚠️  Some tests failed. Check the output above.', 'yellow');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch((error) => {
  log(`\n💥 Test runner error: ${error.message}`, 'red');
  process.exit(1);
});
