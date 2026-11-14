#!/usr/bin/env node
/**
 * Phase 0 admin smoke against a remote API (QA by default).
 *
 * Usage:
 *   npm run test:admin-phase0-smoke:qa
 *   API_BASE_URL=https://….workers.dev/api/v1 node tests/test-admin-phase0-smoke.js
 *
 * Env:
 *   ADMIN_EMAIL / ADMIN_PASSWORD — staff credentials (default local/QA seed)
 *   REVIEW_PASSWORD — consumer review account (QA only)
 *   SKIP_RATE_LIMIT=1 — skip the 429 probe (use when admin is already locked)
 */
const BASE = (process.env.API_BASE_URL || 'https://growl-backend-qa.wispy-leaf-4e8b.workers.dev/api/v1').replace(
  /\/$/,
  ''
);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@growl.app';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'GrowlAdmin123!';
const REVIEW_EMAIL = 'review@growl.app';
const SKIP_RATE_LIMIT = process.env.SKIP_RATE_LIMIT === '1';

let passed = 0;
let failed = 0;
let skipped = 0;

async function req(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function assert(cond, name, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function skip(name, reason) {
  skipped++;
  console.log(`  ~ ${name} — ${reason}`);
}

async function main() {
  console.log(`Admin Phase 0 smoke → ${BASE}\n`);

  // 1. Staff login
  let login = await req('POST', '/admin/auth/login', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (login.status === 429) {
    console.error(
      'Admin login rate-limited (15m window). Re-run with SKIP_RATE_LIMIT=1 after cooldown, or wait ~15 minutes.'
    );
  }
  assert(login.status === 200 && login.json.success, 'admin login', JSON.stringify(login.json.error || login.status));
  const token = login.json.data?.token;
  if (!token) {
    console.error('Aborting: no admin token');
    process.exit(1);
  }

  // 2. Me + permissions
  const me = await req('GET', '/admin/auth/me', { token });
  assert(me.status === 200 && me.json.data?.admin?.email === ADMIN_EMAIL, 'admin /me');

  // 3. Dashboard
  const dash = await req('GET', '/admin/dashboard/overview', { token });
  assert(dash.status === 200 && dash.json.data?.kpis, 'dashboard overview');

  // 4. Audit filters (empty ok)
  const audit = await req('GET', '/admin/audit/logs?target_type=report&limit=10', { token });
  assert(audit.status === 200 && Array.isArray(audit.json.data?.logs), 'audit logs with target_type');

  // 5. Resolve review user id (QA-only seed)
  const users = await req('GET', `/admin/users?q=${encodeURIComponent(REVIEW_EMAIL)}`, { token });
  const reviewUser = (users.json.data?.users || []).find((u) => u.email === REVIEW_EMAIL);
  if (!reviewUser) {
    skip('find review@growl.app user', 'not seeded on this environment (expected on production)');
  } else {
    assert(true, 'find review@growl.app user');
  }

  // 6. Protected enforcement 403
  if (reviewUser) {
    const enf = await req('POST', `/admin/users/${reviewUser.id}/enforcement`, {
      token,
      body: { action: 'ban', reasonCode: 'other', reasonText: 'smoke test must fail' },
    });
    assert(enf.status === 403 && enf.json.error?.code === 'PROTECTED_ACCOUNT', 'ban review user blocked');
  } else {
    skip('ban review user blocked', 'no review user');
  }

  // 7. Soft-hide path via consumer report (QA)
  const consumerLogin = await req('POST', '/auth/sign-in', {
    body: { email: REVIEW_EMAIL, password: process.env.REVIEW_PASSWORD || 'GrowlReview123!' },
  });
  const consumerToken = consumerLogin.json.data?.token;
  if (!consumerToken) {
    skip('consumer review login', 'review account unavailable on this environment');
  } else {
    assert(true, 'consumer review login');
  }

  let postId = null;
  if (consumerToken) {
    // Always seed a throwaway author — protected demo/review posts cannot be soft-hidden.
    const smokeEmail = `smoke.${Date.now().toString(36)}@letsgrow.lu`;
    const smokePass = 'GrowlSmoke123!';
    const signup = await req('POST', '/auth/sign-up', {
      body: {
        email: smokeEmail,
        password: smokePass,
        username: `smk${Date.now().toString(36).slice(-8)}`,
      },
    });
    let smokeToken = signup.json.data?.token || null;
    const verifyCode = signup.json.data?.devVerificationCode;
    if (!smokeToken && verifyCode) {
      await req('POST', '/auth/verify-email', {
        body: { email: smokeEmail, code: verifyCode },
      });
      const smokeLogin = await req('POST', '/auth/sign-in', {
        body: { email: smokeEmail, password: smokePass },
      });
      smokeToken = smokeLogin.json.data?.token || null;
    } else if (!smokeToken) {
      const smokeLogin = await req('POST', '/auth/sign-in', {
        body: { email: smokeEmail, password: smokePass },
      });
      smokeToken = smokeLogin.json.data?.token || null;
    }
    if (smokeToken) {
      const created = await req('POST', '/feed/posts', {
        token: smokeToken,
        body: {
          image_url: `https://picsum.photos/seed/smoke-${Date.now()}/800/800`,
          caption: 'Phase0 smoke seed post',
          category: 'fitness',
        },
      });
      postId = created.json.data?.id || created.json.data?.post?.id;
    }
    assert(
      !!postId,
      'seed throwaway post for soft-hide',
      JSON.stringify({
        signup: signup.json.error || signup.status,
        hasCode: !!verifyCode,
        hasToken: !!smokeToken,
      })
    );
  }

  if (postId && consumerToken) {
    const reportRes = await req('POST', '/social/report', {
      token: consumerToken,
      body: { targetId: postId, targetType: 'post', reason: 'spam' },
    }).catch(() => ({ status: 0, json: {} }));

    let caseId = reportRes.json.data?.id || reportRes.json.data?.reportId;
    if (!caseId) {
      const list = await req('GET', '/admin/moderation/reports?status=', { token });
      const existing = (list.json.data?.reports || []).find(
        (r) => r.target_type === 'post' && r.target_id === postId
      );
      caseId = existing?.id;
    }

    if (caseId) {
      const decide = await req('POST', `/admin/moderation/reports/${caseId}/decision`, {
        token,
        body: {
          decision: {
            action: 'manual_review',
            reasonCode: 'spam',
            reasonText: 'Phase0 smoke soft-hide',
            enforcement: { contentAction: 'remove', userAction: 'none' },
            closeReport: true,
          },
        },
      });
      assert(
        decide.status === 200 && decide.json.success,
        'moderation decide soft-hide',
        JSON.stringify(decide.json.error || decide.status)
      );

      const detail = await req('GET', `/feed/posts/${postId}`, { token: consumerToken });
      assert(
        detail.status === 404 || detail.json.error?.code === 'POST_NOT_FOUND',
        'hidden post 404 from feed detail'
      );
    } else {
      skip('moderation decide soft-hide', `no report case for ${postId}`);
      skip('hidden post 404 from feed detail', 'no decide');
    }
  }

  // 8. MFA setup endpoint
  const mfa = await req('POST', '/admin/auth/mfa/setup', { token, body: {} });
  assert(
    mfa.status === 200 && mfa.json.data?.secret && mfa.json.data?.otpauth_url,
    'mfa setup returns secret+otpauth'
  );

  // 9. Rate limit — use a disposable email so we never lock the real admin seed
  if (SKIP_RATE_LIMIT) {
    skip('admin login rate limit returns 429', 'SKIP_RATE_LIMIT=1');
  } else {
    const baitEmail = `smoke-ratelimit-${Date.now()}@growl.app`;
    let got429 = false;
    // Email bucket is 10/900s; keep under IP bucket (20/900s) so we don't lock staff login.
    for (let i = 0; i < 12; i++) {
      const bad = await req('POST', '/admin/auth/login', {
        body: { email: baitEmail, password: 'definitely-wrong-password' },
      });
      if (bad.status === 429) {
        got429 = true;
        break;
      }
    }
    assert(got429, 'admin login rate limit returns 429');
  }

  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
