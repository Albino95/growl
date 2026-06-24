#!/usr/bin/env node
/**
 * Admin business provisioning smoke test.
 * 1. Bootstrap/admin login
 * 2. Create business account via admin API
 * 3. Sign in as business user -> isBusiness true
 * 4. GET /business/dashboard -> 200
 * 5. Sign in as consumer -> GET /business/dashboard -> 403
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:8787/api/v1';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@growl.app';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'GrowlAdmin123!';
const CONSUMER_EMAIL = process.env.SMOKE_EMAIL || 'demo@growl.app';
const CONSUMER_PASSWORD = process.env.SMOKE_PASSWORD || 'GrowlDemo123!';

const colors = { reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m' };

function log(status, msg) {
  const c = status === 'PASS' ? colors.green : status === 'FAIL' ? colors.red : colors.yellow;
  console.log(`${c}${status}${colors.reset} ${msg}`);
}

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${path}`);
    const lib = url.protocol === 'https:' ? https : http;
    const payload = body ? JSON.stringify(body) : undefined;
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch {
            json = { raw: data };
          }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  let failed = 0;
  const stamp = Date.now();
  const bizEmail = `biz.smoke.${stamp}@growl.test`;
  const bizPassword = 'BizSmokePass123!';

  // Bootstrap admin if needed (dev only)
  await request('POST', '/admin/auth/bootstrap', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

  const login = await request('POST', '/admin/auth/login', {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  if (login.status !== 200 || !login.json?.data?.token) {
    log('FAIL', `admin-login (${login.status}) — seed admin first: node scripts/seed-admin-user.js --local`);
    process.exit(1);
  }
  log('PASS', 'admin-login');
  const adminToken = login.json.data.token;

  const create = await request(
    'POST',
    '/admin/business/accounts',
    {
      email: bizEmail,
      temporaryPassword: bizPassword,
      displayName: 'Smoke Test Biz',
      contactEmail: `contact.${bizEmail}`,
      fieldOfOperation: 'fitness',
    },
    adminToken
  );
  if (create.status !== 201 || !create.json?.data?.userId) {
    log('FAIL', `create-business-account (${create.status}) ${JSON.stringify(create.json?.error)}`);
    failed++;
  } else {
    log('PASS', 'create-business-account');
  }

  const bizSignIn = await request('POST', '/auth/sign-in', { email: bizEmail, password: bizPassword });
  const bizToken = bizSignIn.json?.data?.token;
  const isBusiness = bizSignIn.json?.data?.isBusiness;
  if (bizSignIn.status !== 200 || !bizToken || !isBusiness) {
    log('FAIL', `business-sign-in isBusiness=${isBusiness} status=${bizSignIn.status}`);
    failed++;
  } else {
    log('PASS', 'business-sign-in isBusiness=true');
  }

  const bizDash = await request('GET', '/business/dashboard', null, bizToken);
  if (bizDash.status === 200) {
    log('PASS', 'business-dashboard 200');
  } else {
    log('FAIL', `business-dashboard expected 200 got ${bizDash.status}`);
    failed++;
  }

  const consumerSignIn = await request('POST', '/auth/sign-in', {
    email: CONSUMER_EMAIL,
    password: CONSUMER_PASSWORD,
  });
  const consumerToken = consumerSignIn.json?.data?.token;
  if (consumerSignIn.status !== 200 || !consumerToken) {
    log('WARN', `consumer-sign-in skipped (${consumerSignIn.status}) — seed demo account for full test`);
  } else {
    const forbidden = await request('GET', '/business/dashboard', null, consumerToken);
    if (forbidden.status === 403) {
      log('PASS', 'consumer-business-dashboard 403');
    } else {
      log('FAIL', `consumer-business-dashboard expected 403 got ${forbidden.status}`);
      failed++;
    }
  }

  console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
