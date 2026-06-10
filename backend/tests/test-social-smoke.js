#!/usr/bin/env node

/**
 * Social smoke test
 * Verifies comments count, likes list, friend likes list, and block flow.
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const BASE_URL = process.env.API_BASE_URL || 'https://growl-backend.albino-ndreu.workers.dev/api/v1';
const TEST_EMAIL = process.env.SMOKE_EMAIL || 'demo@growl.app';
const TEST_PASSWORD = process.env.SMOKE_PASSWORD || 'GrowlDemo123!';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const results = [];

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`, ok ? 'green' : 'red');
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function fetchRaw(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const transport = u.protocol === 'https:' ? https : http;
    const req = transport.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            ok: res.statusCode >= 200 && res.statusCode < 300,
            body,
            json: safeJsonParse(body),
          });
        });
      }
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetchRaw(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function pickTokenPayload(json) {
  const data = json?.data || {};
  return {
    token: data.token || null,
    userId: data.user?.id || data.userId || null,
  };
}

function ensureApiSuccess(resp) {
  return !!resp.ok && !!resp.json?.success;
}

async function run() {
  log(`\nSocial smoke against: ${BASE_URL}`, 'cyan');
  log(`Using account: ${TEST_EMAIL}\n`, 'yellow');

  const signIn = await api('POST', '/auth/sign-in', { email: TEST_EMAIL, password: TEST_PASSWORD });
  const authOk = ensureApiSuccess(signIn);
  const payload = pickTokenPayload(signIn.json);
  record('sign-in', authOk && !!payload.token && !!payload.userId, `status=${signIn.status}`);
  if (!authOk || !payload.token || !payload.userId) process.exit(1);

  const token = payload.token;
  const selfId = payload.userId;

  const feedResp = await api('GET', '/feed/feed', null, token);
  const feedOk = ensureApiSuccess(feedResp) && Array.isArray(feedResp.json?.data);
  const feedItems = feedOk ? feedResp.json.data : [];
  const feedHasItems = feedOk && feedItems.length > 0;
  record('feed-load', feedHasItems, `items=${feedItems.length}`);
  if (!feedHasItems) process.exit(1);

  const candidate = feedItems.find((p) => p?.user_id && p.user_id !== selfId) || feedItems[0];
  const postId = candidate.id;
  const targetUserId = candidate.user_id;
  const expectedComments = Number(candidate?.metadata?.comments || 0);
  const expectedLikes = Number(candidate?.metadata?.likes || 0);
  const expectedFriendLikes = Number(candidate?.metadata?.friend_likes_count || 0);

  const commentsResp = await api('GET', `/feed/posts/${encodeURIComponent(postId)}/comments`, null, token);
  const commentsOk = ensureApiSuccess(commentsResp) && Array.isArray(commentsResp.json?.data);
  const commentsCount = commentsOk ? commentsResp.json.data.length : -1;
  record('comments-list-load', commentsOk, `count=${commentsCount}`);
  if (commentsOk) {
    record('comments-count-match', commentsCount === expectedComments, `expected=${expectedComments}, got=${commentsCount}`);
  }

  const likesResp = await api('GET', `/feed/posts/${encodeURIComponent(postId)}/likes`, null, token);
  const likesOk = ensureApiSuccess(likesResp) && likesResp.json?.data;
  const likesData = likesOk ? likesResp.json.data : {};
  const likers = Array.isArray(likesData.likers) ? likesData.likers : [];
  const friendLikers = Array.isArray(likesData.friendLikers) ? likesData.friendLikers : [];
  const likesCount = Number(likesData.likes || 0);
  const friendLikesCount = Number(likesData.friendLikesCount || 0);
  record('likes-list-load', !!likesOk, `status=${likesResp.status}`);
  if (likesOk) {
    record('likes-count-self-consistent', likesCount === likers.length, `likes=${likesCount}, list=${likers.length}`);
    record(
      'friend-likes-self-consistent',
      friendLikesCount === friendLikers.length,
      `friendLikes=${friendLikesCount}, list=${friendLikers.length}`
    );
    record(
      'friend-likers-subset',
      friendLikers.every((u) => likers.some((x) => x.id === u.id)),
      `friendLikers=${friendLikers.length}, likers=${likers.length}`
    );
    if (expectedLikes > 0) {
      record('likes-count-match-post-metadata', likesCount === expectedLikes, `expected=${expectedLikes}, got=${likesCount}`);
    }
    record(
      'friend-likes-match-post-metadata',
      friendLikesCount === expectedFriendLikes,
      `expected=${expectedFriendLikes}, got=${friendLikesCount}`
    );
  }

  if (!targetUserId || targetUserId === selfId) {
    record('block-flow-skipped', false, 'no non-self user found in feed');
  } else {
    const blockResp = await api('POST', '/social/block', { targetUserId }, token);
    record('block-request', ensureApiSuccess(blockResp), `status=${blockResp.status}`);

    const statusResp = await api(
      'GET',
      `/social/friends/status/${encodeURIComponent(targetUserId)}`,
      null,
      token
    );
    const blocked = !!statusResp.json?.data?.blocked;
    record('block-status-reflects-true', ensureApiSuccess(statusResp) && blocked, `blocked=${blocked}`);

    const feedAfterBlock = await api('GET', '/feed/feed', null, token);
    const feedAfterOk = ensureApiSuccess(feedAfterBlock) && Array.isArray(feedAfterBlock.json?.data);
    const stillVisible = feedAfterOk
      ? feedAfterBlock.json.data.some((p) => p?.user_id === targetUserId)
      : true;
    record('blocked-user-hidden-in-feed', feedAfterOk && !stillVisible, `stillVisible=${stillVisible}`);

    const unblockResp = await api(
      'DELETE',
      `/social/block/${encodeURIComponent(targetUserId)}`,
      null,
      token
    );
    record('cleanup-unblock', ensureApiSuccess(unblockResp), `status=${unblockResp.status}`);
  }

  const passed = results.filter((t) => t.ok).length;
  const failed = results.length - passed;
  log(`\nSummary: passed=${passed}, failed=${failed}`, failed === 0 ? 'green' : 'red');
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  log(`Unhandled error: ${err?.message || String(err)}`, 'red');
  process.exit(1);
});

