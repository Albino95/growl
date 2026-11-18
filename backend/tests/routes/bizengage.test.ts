/**
 * Wave 6 engagement: product Q&A, verified-purchase reviews + business replies,
 * saved replies / away message and the away auto-reply hook. Real in-memory SQLite
 * built from every migration.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';
import { createSqliteD1, loadMigrationsSql, trackParams } from '../utils/sqliteD1';
import { signAccessToken } from '../../src/utils/jwt';
import { inAwayWindow, localClock, maybeSendAwayReply } from '../../src/routes/wave3/bizengage';

const SCHEMA = loadMigrationsSql();

let db: ReturnType<typeof createSqliteD1>['raw'];
let env: Env;
let stats: { maxParams: number; maxSql: string };

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

function addUser(id: string, opts: { business?: boolean; tz?: string } = {}) {
  db.prepare(
    `INSERT INTO users (id, email, password_hash, metadata, email_verified, timezone, is_business, created_at, updated_at)
     VALUES (?, ?, 'x', ?, 1, ?, ?, datetime('now'), datetime('now'))`
  ).run(id, `${id}@example.com`, JSON.stringify({ username: id }), opts.tz ?? 'UTC', opts.business ? 1 : 0);
}

function addProduct(id: string, owner: string) {
  db.prepare(
    `INSERT INTO products (id, user_id, name, category, price, stock, created_at, updated_at)
     VALUES (?, ?, ?, 'fitness', 10, 5, datetime('now'), datetime('now'))`
  ).run(id, owner, `Product ${id}`);
}

function addOrder(id: string, buyer: string, seller: string, productId: string, status: string) {
  db.prepare(
    `INSERT INTO orders (id, user_id, business_id, status, total, shipping_address, metadata, payment_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 10, '{}', '{}', 'paid', datetime('now'), datetime('now'))`
  ).run(id, buyer, seller, status);
  db.prepare(
    `INSERT INTO order_items (id, order_id, product_id, quantity, price, created_at)
     VALUES (?, ?, ?, 1, 10, datetime('now'))`
  ).run(`oi_${id}`, id, productId);
}

function block(a: string, b: string) {
  db.prepare(
    `INSERT INTO user_relationships (id, user_id, target_user_id, type, created_at)
     VALUES (?, ?, ?, 'block', datetime('now'))`
  ).run(`rel_${a}_${b}`, a, b);
}

function befriend(a: string, b: string) {
  for (const [x, y] of [[a, b], [b, a]]) {
    db.prepare(
      `INSERT INTO user_relationships (id, user_id, target_user_id, type, created_at)
       VALUES (?, ?, ?, 'friend', datetime('now'))`
    ).run(`fr_${x}_${y}`, x, y);
  }
}

async function call(userId: string | null, method: string, path: string, body?: unknown) {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (userId) h.Authorization = `Bearer ${await signAccessToken(userId, env)}`;
  const res = await worker.fetch(
    new Request(`https://api.test/api/v1${path}`, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
    ctx
  );
  const json = (await res.json()) as any;
  return { status: res.status, body: json, data: json.data };
}

function all<T = any>(sql: string, ...args: unknown[]): T[] {
  return db.prepare(sql).all(...args) as T[];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-16T12:00:00Z')); // Monday
  const sqlite = createSqliteD1(SCHEMA);
  db = sqlite.raw;
  const tracked = trackParams(sqlite.d1);
  stats = tracked.stats;
  const kv = new Map<string, string>();
  env = {
    DB: tracked.d1 as any,
    KV: {
      get: async (k: string) => kv.get(k) ?? null,
      put: async (k: string, v: string) => void kv.set(k, v),
      delete: async (k: string) => void kv.delete(k),
    } as any,
    ENVIRONMENT: 'test',
    JWT_SECRET: 'wave6-engage-secret',
    API_VERSION: 'v1',
  } as Env;
  addUser('shop', { business: true, tz: 'Europe/Luxembourg' });
  addUser('shop2', { business: true });
  addUser('buyer');
  addUser('other');
  addProduct('p1', 'shop');
  addProduct('p2', 'shop2');
});

afterEach(() => {
  expect(stats.maxParams, stats.maxSql).toBeLessThanOrEqual(100);
  vi.useRealTimers();
});

describe('product Q&A', () => {
  it('ask → business notified → answer → asker notified → public', async () => {
    const ask = await call('buyer', 'POST', '/products/p1/questions', { body: 'Is this mat non-slip?' });
    expect(ask.status).toBe(201);
    const qid = ask.data.question.id;
    expect(ask.data.question.asker.name).toBe('buyer');

    const notif = all(`SELECT * FROM user_notifications WHERE user_id = 'shop'`);
    expect(notif).toHaveLength(1);
    expect(notif[0].type).toBe('product_question');
    const bn = all(`SELECT * FROM business_notifications WHERE business_id = 'shop'`);
    expect(bn).toHaveLength(1);
    expect(bn[0].ref_type).toBe('product_question');

    // Unanswered questions are only visible to the asker and the business.
    expect((await call('other', 'GET', '/products/p1/questions')).data.questions).toHaveLength(0);
    expect((await call('buyer', 'GET', '/products/p1/questions')).data.questions).toHaveLength(1);

    const inbox = await call('shop', 'GET', '/business/questions?status=unanswered');
    expect(inbox.data.questions.map((q: any) => q.id)).toEqual([qid]);
    expect(inbox.data.questions[0].product.name).toBe('Product p1');
    expect((await call('shop', 'GET', '/business/engage/summary')).data).toEqual({
      unanswered_questions: 1,
      unreplied_reviews: 0,
    });

    const ans = await call('shop', 'POST', `/business/questions/${qid}/answer`, { body: 'Yes, fully.' });
    expect(ans.status).toBe(200);
    expect(ans.data.question.answer.body).toBe('Yes, fully.');
    expect(all(`SELECT * FROM user_notifications WHERE user_id = 'buyer' AND type = 'product_answer'`)).toHaveLength(1);

    // Editing the answer doesn't notify again.
    await call('shop', 'POST', `/business/questions/${qid}/answer`, { body: 'Yes, fully non-slip.' });
    expect(all(`SELECT * FROM user_notifications WHERE user_id = 'buyer'`)).toHaveLength(1);

    const pub = await call(null, 'GET', '/products/p1/questions');
    expect(pub.data.questions).toHaveLength(1);
    expect(pub.data.questions[0].answer.body).toBe('Yes, fully non-slip.');
    expect((await call('shop', 'GET', '/business/questions')).data.questions).toHaveLength(0);
    expect((await call('shop', 'GET', '/business/questions?status=all')).data.questions).toHaveLength(1);
  });

  it('only the product owner can answer or hide; hidden questions disappear', async () => {
    const qid = (await call('buyer', 'POST', '/products/p1/questions', { body: 'Colour options?' })).data.question.id;
    expect((await call('buyer', 'POST', `/business/questions/${qid}/answer`, { body: 'x' })).status).toBe(403);
    expect((await call('shop2', 'POST', `/business/questions/${qid}/answer`, { body: 'x' })).status).toBe(404);
    expect((await call('shop2', 'DELETE', `/business/questions/${qid}`)).status).toBe(404);
    expect((await call('shop', 'DELETE', `/business/questions/${qid}`)).data).toEqual({ hidden: true });
    expect((await call('buyer', 'GET', '/products/p1/questions')).data.questions).toHaveLength(0);
    expect((await call('shop', 'GET', '/business/engage/summary')).data.unanswered_questions).toBe(0);
  });

  it('validates input, auth and own product', async () => {
    expect((await call(null, 'POST', '/products/p1/questions', { body: 'Hello there' })).status).toBe(401);
    expect((await call('buyer', 'POST', '/products/p1/questions', { body: 'x'.repeat(301) })).status).toBe(400);
    expect((await call('shop', 'POST', '/products/p1/questions', { body: 'My own?' })).body.error.code).toBe(
      'OWN_PRODUCT'
    );
    expect((await call('buyer', 'POST', '/products/nope/questions', { body: 'Hello?' })).status).toBe(404);
  });

  it('blocks: blocked users cannot ask, and are hidden from each other', async () => {
    const qid = (await call('other', 'POST', '/products/p1/questions', { body: 'Does it ship to BE?' })).data.question.id;
    await call('shop', 'POST', `/business/questions/${qid}/answer`, { body: 'Yes.' });
    expect((await call('buyer', 'GET', '/products/p1/questions')).data.questions).toHaveLength(1);

    block('buyer', 'other');
    expect((await call('buyer', 'GET', '/products/p1/questions')).data.questions).toHaveLength(0);
    expect((await call('other', 'GET', '/products/p1/questions')).data.questions).toHaveLength(1);

    block('shop', 'buyer');
    const res = await call('buyer', 'POST', '/products/p1/questions', { body: 'Still there?' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('BLOCKED');
  });

  it('reports go to the moderation queue against the author', async () => {
    const qid = (await call('other', 'POST', '/products/p1/questions', { body: 'Spammy question' })).data.question.id;
    const res = await call('buyer', 'POST', `/product-questions/${qid}/report`, { reason: 'spam' });
    expect(res.status).toBe(200);
    const rows = all(`SELECT * FROM reports`);
    expect(rows).toHaveLength(1);
    expect(rows[0].target_type).toBe('user');
    expect(rows[0].target_id).toBe('other');
    expect(JSON.parse(rows[0].details)).toMatchObject({ kind: 'product_question', item_id: qid, product_id: 'p1' });
    expect((await call('other', 'POST', `/product-questions/${qid}/report`, { reason: 'x' })).status).toBe(400);
  });
});

describe('reviews', () => {
  it('purchase gate: no delivered order ⇒ 403 REVIEW_NEEDS_PURCHASE', async () => {
    const res = await call('buyer', 'POST', '/products/p1/reviews', { rating: 5, body: 'Great' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('REVIEW_NEEDS_PURCHASE');

    addOrder('o1', 'buyer', 'shop', 'p1', 'shipped');
    expect((await call('buyer', 'POST', '/products/p1/reviews', { rating: 5 })).status).toBe(403);
    const list = await call('buyer', 'GET', '/products/p1/reviews');
    expect(list.data.viewer).toMatchObject({ can_review: false, reason: 'needs_purchase' });
    expect((await call(null, 'GET', '/products/p1/reviews')).data.viewer.reason).toBe('signed_out');
    expect((await call('shop', 'GET', '/products/p1/reviews')).data.viewer.reason).toBe('own_product');
  });

  it('delivered purchaser reviews once (editable); business replies once (editable)', async () => {
    addOrder('o1', 'buyer', 'shop', 'p1', 'delivered');
    expect((await call('buyer', 'GET', '/products/p1/reviews')).data.viewer.can_review).toBe(true);

    const created = await call('buyer', 'POST', '/products/p1/reviews', { rating: 4, body: 'Solid mat' });
    expect(created.status).toBe(201);
    expect(created.data.review.verified_purchase).toBe(true);
    const rid = created.data.review.id;
    expect(all(`SELECT * FROM user_notifications WHERE user_id = 'shop' AND type = 'product_review'`)).toHaveLength(1);

    const edited = await call('buyer', 'POST', '/products/p1/reviews', { rating: 5, body: 'Love it' });
    expect(edited.status).toBe(200);
    expect(edited.data.review.id).toBe(rid);
    expect(all(`SELECT * FROM product_reviews`)).toHaveLength(1);

    expect((await call('shop', 'GET', '/business/engage/summary')).data.unreplied_reviews).toBe(1);
    expect((await call('shop2', 'POST', `/business/reviews/${rid}/reply`, { body: 'x' })).status).toBe(404);
    expect((await call('buyer', 'POST', `/business/reviews/${rid}/reply`, { body: 'x' })).status).toBe(403);
    const r1 = await call('shop', 'POST', `/business/reviews/${rid}/reply`, { body: 'Thank you!' });
    expect(r1.data.review.reply.body).toBe('Thank you!');
    await call('shop', 'POST', `/business/reviews/${rid}/reply`, { body: 'Thank you so much!' });
    expect(all(`SELECT * FROM review_replies`)).toHaveLength(1);
    expect(all(`SELECT * FROM user_notifications WHERE user_id = 'buyer' AND type = 'review_reply'`)).toHaveLength(1);

    const pub = await call(null, 'GET', '/products/p1/reviews');
    expect(pub.data.count).toBe(1);
    expect(pub.data.average).toBe(5);
    expect(pub.data.reviews[0].reply.body).toBe('Thank you so much!');
    expect((await call('shop', 'GET', '/business/reviews')).data.reviews).toHaveLength(0);
    expect((await call('shop', 'GET', '/business/reviews?status=all')).data.reviews).toHaveLength(1);
  });

  it('blocked purchasers cannot review; reviews hidden between blocked users', async () => {
    addOrder('o1', 'buyer', 'shop', 'p1', 'delivered');
    addOrder('o2', 'other', 'shop', 'p1', 'completed');
    await call('other', 'POST', '/products/p1/reviews', { rating: 3, body: 'ok' });
    block('buyer', 'other');
    expect((await call('buyer', 'GET', '/products/p1/reviews')).data.reviews).toHaveLength(0);
    block('buyer', 'shop');
    const res = await call('buyer', 'POST', '/products/p1/reviews', { rating: 5 });
    expect(res.body.error.code).toBe('BLOCKED');
  });

  it('validates rating', async () => {
    addOrder('o1', 'buyer', 'shop', 'p1', 'delivered');
    expect((await call('buyer', 'POST', '/products/p1/reviews', { rating: 6 })).status).toBe(400);
    expect((await call('buyer', 'POST', '/products/p1/reviews', { rating: 0 })).status).toBe(400);
  });
});

describe('inbox settings', () => {
  it('business only; saves saved replies and away message', async () => {
    expect((await call('buyer', 'GET', '/business/inbox-settings')).status).toBe(403);
    const empty = await call('shop', 'GET', '/business/inbox-settings');
    expect(empty.data).toEqual({ saved_replies: [], away: { enabled: false, message: '', schedule: null } });

    const put = await call('shop', 'PUT', '/business/inbox-settings', {
      saved_replies: [{ title: 'Shipping', body: 'We ship in 2 days.' }],
      away: { enabled: true, message: 'Back Monday!', schedule: { days: [6, 0, 0], from: '00:00', to: '00:00' } },
    });
    expect(put.status).toBe(200);
    expect(put.data.saved_replies[0].id).toBeTruthy();
    expect(put.data.away.schedule.days).toEqual([0, 6]);

    // Partial update keeps the other half.
    const put2 = await call('shop', 'PUT', '/business/inbox-settings', {
      away: { enabled: false, message: 'Back Monday!' },
    });
    expect(put2.data.saved_replies).toHaveLength(1);
    expect(put2.data.away.schedule.days).toEqual([0, 6]);

    expect(
      (await call('shop', 'PUT', '/business/inbox-settings', { away: { enabled: true, message: '' } })).status
    ).toBe(400);
    const tooMany = Array.from({ length: 21 }, (_, i) => ({ title: `t${i}`, body: 'b' }));
    expect((await call('shop', 'PUT', '/business/inbox-settings', { saved_replies: tooMany })).status).toBe(400);
  });
});

describe('away auto-reply', () => {
  it('schedule window uses the business timezone and handles overnight spans', () => {
    // 2026-11-16T12:00Z is Monday 13:00 in Luxembourg.
    const at = new Date('2026-11-16T12:00:00Z');
    expect(localClock('Europe/Luxembourg', at)).toEqual({ day: 1, minutes: 13 * 60 });
    expect(inAwayWindow(null, 'UTC', at)).toBe(true);
    expect(inAwayWindow({ days: [1], from: '12:30', to: '14:00' }, 'Europe/Luxembourg', at)).toBe(true);
    expect(inAwayWindow({ days: [1], from: '12:30', to: '14:00' }, 'UTC', at)).toBe(false);
    // Sunday 22:00 → 08:00 covers Monday 07:00 local.
    const early = new Date('2026-11-16T06:00:00Z');
    expect(inAwayWindow({ days: [0], from: '22:00', to: '08:00' }, 'Europe/Luxembourg', early)).toBe(true);
    expect(inAwayWindow({ days: [1], from: '22:00', to: '08:00' }, 'Europe/Luxembourg', early)).toBe(false);
    expect(inAwayWindow({ days: [], from: '00:00', to: '00:00' }, 'UTC', at)).toBe(false);
  });

  async function setupConversation() {
    befriend('buyer', 'shop');
    const conv = await call('buyer', 'POST', '/messages/conversations', { targetUserId: 'shop' });
    expect([200, 201]).toContain(conv.status);
    return (conv.data.conversation?.id ?? conv.data.id) as string;
  }

  it('replies once per conversation per 12 h, only to customers, flagged auto', async () => {
    await call('shop', 'PUT', '/business/inbox-settings', { away: { enabled: true, message: 'We are away!' } });
    const convId = await setupConversation();

    const s1 = await call('buyer', 'POST', `/messages/conversations/${convId}/messages`, { body: 'Hi!' });
    expect(s1.status).toBe(201);
    let msgs = all(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at`, convId);
    expect(msgs).toHaveLength(2);
    expect(msgs[1].sender_id).toBe('shop');
    expect(msgs[1].body).toBe('We are away!');
    expect(JSON.parse(msgs[1].metadata)).toEqual({ auto: true });

    await call('buyer', 'POST', `/messages/conversations/${convId}/messages`, { body: 'Hello?' });
    // The business's own message never triggers an auto reply.
    await call('shop', 'POST', `/messages/conversations/${convId}/messages`, { body: 'Hi back' });
    msgs = all(`SELECT * FROM messages WHERE conversation_id = ?`, convId);
    expect(msgs.filter((m: any) => m.metadata)).toHaveLength(1);

    vi.setSystemTime(new Date('2026-11-17T00:30:00Z')); // 12.5 h later
    await call('buyer', 'POST', `/messages/conversations/${convId}/messages`, { body: 'Again' });
    msgs = all(`SELECT * FROM messages WHERE conversation_id = ?`, convId);
    expect(msgs.filter((m: any) => m.metadata)).toHaveLength(2);
  });

  it('respects the schedule and the enabled switch', async () => {
    // Saturday & Sunday only; now is Monday.
    await call('shop', 'PUT', '/business/inbox-settings', {
      away: { enabled: true, message: 'Weekend!', schedule: { days: [0, 6], from: '00:00', to: '00:00' } },
    });
    const convId = await setupConversation();
    await call('buyer', 'POST', `/messages/conversations/${convId}/messages`, { body: 'Hi!' });
    expect(all(`SELECT * FROM messages WHERE metadata IS NOT NULL`)).toHaveLength(0);

    await call('shop', 'PUT', '/business/inbox-settings', { away: { enabled: false, message: 'Weekend!', schedule: null } });
    await call('buyer', 'POST', `/messages/conversations/${convId}/messages`, { body: 'Hi again' });
    expect(all(`SELECT * FROM messages WHERE metadata IS NOT NULL`)).toHaveLength(0);
  });

  it('never fires between two businesses or for a sender messaging themselves', async () => {
    db.prepare(
      `INSERT INTO business_inbox_settings (business_id, saved_replies, away_enabled, away_message, updated_at)
       VALUES ('shop', '[]', 1, 'Away', datetime('now'))`
    ).run();
    db.prepare(
      `INSERT INTO conversations (id, user_a, user_b, created_at, updated_at) VALUES ('c1', 'shop', 'shop2', datetime('now'), datetime('now'))`
    ).run();
    expect(await maybeSendAwayReply(env, 'c1', 'shop2', 'shop')).toBe(false);
    expect(await maybeSendAwayReply(env, 'c1', 'shop', 'shop')).toBe(false);
    // Wrong conversation for the pair.
    expect(await maybeSendAwayReply(env, 'c1', 'buyer', 'shop')).toBe(false);
  });
});
