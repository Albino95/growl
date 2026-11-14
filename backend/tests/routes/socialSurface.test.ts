/**
 * Social surface regressions against a real (in-memory) SQLite schema.
 * The test auth bypass always resolves to user id `test-user`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createMockEnv, parseJsonResponse } from '../utils/test-helpers';
import { createSqliteD1, SOCIAL_SCHEMA } from '../utils/sqliteD1';
import * as messagesRoutes from '../../src/routes/messages';
import * as commentRoutes from '../../src/routes/comments';
import * as storiesRoutes from '../../src/routes/stories';
import type { Env } from '../../src/types';

const ME = 'test-user';
const BASE = 'https://api.test/api/v1';

function req(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.auth !== false) headers.Authorization = 'Bearer test';
  return new Request(`${BASE}${path}`, {
    method: init.method || 'GET',
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
}

describe('social surface', () => {
  let env: Env;
  let db: ReturnType<typeof createSqliteD1>['raw'];

  const addUser = (id: string, username = id) =>
    db
      .prepare(`INSERT INTO users (id, email, metadata) VALUES (?, ?, ?)`)
      .run(id, `${id}@example.com`, JSON.stringify({ username }));
  const relate = (from: string, to: string, type: string) =>
    db
      .prepare(`INSERT INTO user_relationships (id, user_id, target_user_id, type) VALUES (?, ?, ?, ?)`)
      .run(`rel-${from}-${to}-${type}`, from, to, type);

  beforeEach(() => {
    const sqlite = createSqliteD1(SOCIAL_SCHEMA);
    db = sqlite.raw;
    env = createMockEnv();
    env.DB = sqlite.d1 as any;
    addUser(ME, 'me');
    addUser('friend', 'friendo');
    addUser('stranger', 'stranger');
  });

  describe('messages', () => {
    const seedThread = (count: number) => {
      relate(ME, 'friend', 'friend');
      relate('friend', ME, 'friend');
      const now = '2026-01-01T00:00:00.000Z';
      db.prepare(
        `INSERT INTO conversations (id, user_a, user_b, created_at, updated_at, last_message_at)
         VALUES ('conv1', 'friend', ?, ?, ?, ?)`
      ).run(ME, now, now, now);
      const insert = db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES (?, 'conv1', ?, ?, ?)`
      );
      for (let i = 0; i < count; i += 1) {
        const at = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
        insert.run(`msg-${String(i).padStart(4, '0')}`, i % 2 ? ME : 'friend', `m${i}`, at);
      }
    };

    it('returns the newest page in chronological order, with has_more', async () => {
      seedThread(130);
      const res = await messagesRoutes.getMessages(
        req('/messages/conversations/conv1/messages?limit=50'),
        env,
        'conv1'
      );
      const body = await parseJsonResponse(res);
      expect(res.status).toBe(200);
      const bodies = body.data.messages.map((m: { body: string }) => m.body);
      expect(bodies).toHaveLength(50);
      expect(bodies[0]).toBe('m80');
      expect(bodies[49]).toBe('m129');
      expect(body.data.has_more).toBe(true);
      expect(body.data.next_before).toEqual({
        before: body.data.messages[0].created_at,
        before_id: body.data.messages[0].id,
      });
    });

    it('pages back with the before cursor (tie-broken by id) until has_more is false', async () => {
      seedThread(130);
      // Two messages sharing the oldest-page boundary timestamp must not be skipped.
      db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_id, body, created_at)
         VALUES ('msg-0079b', 'conv1', 'friend', 'tie', ?)`
      ).run(new Date(Date.UTC(2026, 0, 1, 0, 0, 80)).toISOString());

      const seen: string[] = [];
      let cursor = '';
      for (let guard = 0; guard < 10; guard += 1) {
        const res = await messagesRoutes.getMessages(
          req(`/messages/conversations/conv1/messages?limit=50${cursor}`),
          env,
          'conv1'
        );
        const body = await parseJsonResponse(res);
        seen.unshift(...body.data.messages.map((m: { id: string }) => m.id));
        if (!body.data.has_more) break;
        const nb = body.data.next_before;
        cursor = `&before=${encodeURIComponent(nb.before)}&before_id=${encodeURIComponent(nb.before_id)}`;
      }
      expect(seen).toHaveLength(131);
      expect(new Set(seen).size).toBe(131);
      expect(seen[seen.length - 1]).toBe('msg-0129');
    });

    it('canMessagePeer: a block beats an existing friend edge (either direction)', async () => {
      relate(ME, 'friend', 'friend');
      relate('friend', ME, 'friend');
      expect(await messagesRoutes.canMessagePeer(env, ME, 'friend')).toBe(true);
      relate('friend', ME, 'block');
      expect(await messagesRoutes.canMessagePeer(env, ME, 'friend')).toBe(false);
      expect(await messagesRoutes.canMessagePeer(env, 'friend', ME)).toBe(false);
    });

    it('inbox hides blocked peers and never flags an empty conversation unread', async () => {
      relate(ME, 'friend', 'friend');
      relate(ME, 'stranger', 'friend');
      const t = '2026-01-01T00:00:00.000Z';
      db.prepare(
        `INSERT INTO conversations (id, user_a, user_b, created_at, updated_at, last_message_at)
         VALUES ('c-empty', 'friend', ?, ?, ?, NULL), ('c-blocked', 'stranger', ?, ?, ?, ?)`
      ).run(ME, t, t, ME, t, t, t);
      db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_id, body, created_at)
         VALUES ('m1', 'c-blocked', 'stranger', 'hi', ?)`
      ).run(t);
      relate('stranger', ME, 'block');

      const list = await parseJsonResponse(
        await messagesRoutes.getConversations(req('/messages/conversations'), env)
      );
      const ids = list.data.conversations.map((c: { id: string }) => c.id);
      expect(ids).toEqual(['c-empty']);
      expect(list.data.conversations[0].unread).toBe(false);

      const count = await parseJsonResponse(
        await messagesRoutes.unreadCount(req('/messages/unread-count'), env)
      );
      expect(count.data.unread_count).toBe(0);
    });
  });

  describe('comments', () => {
    beforeEach(() => {
      db.prepare(`INSERT INTO posts (id, user_id) VALUES ('post1', 'friend')`).run();
      const ins = db.prepare(
        `INSERT INTO post_engagement (id, post_id, user_id, type, content, created_at)
         VALUES (?, 'post1', ?, 'comment', ?, ?)`
      );
      ins.run('c1', 'friend', 'from author', '2026-01-01 00:00:01');
      ins.run('c2', 'stranger', 'from stranger', '2026-01-01 00:00:02');
      ins.run('c3', ME, 'from me', '2026-01-01 00:00:03');
    });

    const list = async (auth = true) =>
      (
        await parseJsonResponse(
          await commentRoutes.getComments(req('/feed/posts/post1/comments', { auth }), env, 'post1')
        )
      ).data.map((c: { id: string }) => c.id);

    it('filters comments from users blocked in either direction for the viewer', async () => {
      expect(await list()).toEqual(['c1', 'c2', 'c3']);
      relate('stranger', ME, 'block');
      expect(await list()).toEqual(['c1', 'c3']);
      // Guests still see the public thread.
      expect(await list(false)).toEqual(['c1', 'c2', 'c3']);
    });

    it('returns nothing for hidden posts', async () => {
      db.prepare(`UPDATE posts SET is_hidden = 1 WHERE id = 'post1'`).run();
      expect(await list()).toEqual([]);
    });

    it('pages with before/before_id', async () => {
      const res = await commentRoutes.getComments(
        req('/feed/posts/post1/comments?limit=2'),
        env,
        'post1'
      );
      const page1 = (await parseJsonResponse(res)).data;
      expect(page1.map((c: { id: string }) => c.id)).toEqual(['c2', 'c3']);
      const res2 = await commentRoutes.getComments(
        req(
          `/feed/posts/post1/comments?limit=2&before=${encodeURIComponent(page1[0].created_at)}&before_id=c2`
        ),
        env,
        'post1'
      );
      expect((await parseJsonResponse(res2)).data.map((c: { id: string }) => c.id)).toEqual(['c1']);
    });

    it('rejects comments between blocked users and notifies the post author otherwise', async () => {
      relate('friend', ME, 'block');
      const blocked = await commentRoutes.createComment(
        req('/feed/posts/post1/comments', { method: 'POST', body: { content: 'hey' } }),
        env,
        'post1'
      );
      expect(blocked.status).toBe(403);

      db.prepare(`DELETE FROM user_relationships`).run();
      const ok = await commentRoutes.createComment(
        req('/feed/posts/post1/comments', { method: 'POST', body: { content: 'nice' } }),
        env,
        'post1'
      );
      expect(ok.status).toBe(201);
      // Second comment within the coalesce window does not add another notification.
      await commentRoutes.createComment(
        req('/feed/posts/post1/comments', { method: 'POST', body: { content: 'again' } }),
        env,
        'post1'
      );
      const notes = db
        .prepare(`SELECT type, user_id, actor_id, ref_type, ref_id FROM user_notifications`)
        .all();
      expect(notes).toEqual([
        { type: 'post_comment', user_id: 'friend', actor_id: ME, ref_type: 'post', ref_id: 'post1' },
      ]);
    });

    it('lets the post author delete other people’s comments on their post', async () => {
      db.prepare(`INSERT INTO posts (id, user_id) VALUES ('mine', ?)`).run(ME);
      db.prepare(
        `INSERT INTO post_engagement (id, post_id, user_id, type, content, created_at)
         VALUES ('cx', 'mine', 'stranger', 'comment', 'x', datetime('now'))`
      ).run();
      const ok = await commentRoutes.deleteComment(
        req('/feed/posts/mine/comments/cx', { method: 'DELETE' }),
        env,
        'mine',
        'cx'
      );
      expect(ok.status).toBe(200);
      const denied = await commentRoutes.deleteComment(
        req('/feed/posts/post1/comments/c2', { method: 'DELETE' }),
        env,
        'post1',
        'c2'
      );
      expect(denied.status).toBe(403);
    });
  });

  describe('stories', () => {
    const addStory = (id: string, owner: string, ageSql = "datetime('now')") =>
      db
        .prepare(
          `INSERT INTO stories (id, user_id, image_url, created_at, updated_at)
           VALUES (?, ?, 'https://x/api/v1/media/a.jpg', ${ageSql}, ${ageSql})`
        )
        .run(id, owner);

    it('viewers list is owner-only', async () => {
      addStory('mine', ME);
      addStory('theirs', 'friend');
      db.prepare(
        `INSERT INTO story_views (id, story_id, user_id, viewed_at) VALUES ('v1', 'mine', 'friend', datetime('now'))`
      ).run();

      const own = await storiesRoutes.getStoryViewers(req('/stories/mine/viewers'), env, 'mine');
      expect(own.status).toBe(200);
      const body = await parseJsonResponse(own);
      expect(body.data.viewers.map((v: { id: string; username: string }) => v.username)).toEqual([
        'friendo',
      ]);

      const other = await storiesRoutes.getStoryViewers(req('/stories/theirs/viewers'), env, 'theirs');
      expect(other.status).toBe(403);
      const anon = await storiesRoutes.getStoryViewers(
        req('/stories/mine/viewers', { auth: false }),
        env,
        'mine'
      );
      expect(anon.status).toBe(401);
    });

    it('viewStory rejects expired and blocked stories', async () => {
      addStory('old', 'friend', "datetime('now', '-30 hours')");
      addStory('fresh', 'stranger');
      const expired = await storiesRoutes.viewStory(req('/stories/old/view', { method: 'POST' }), env, 'old');
      expect(expired.status).toBe(410);
      relate('stranger', ME, 'block');
      const blocked = await storiesRoutes.viewStory(
        req('/stories/fresh/view', { method: 'POST' }),
        env,
        'fresh'
      );
      expect(blocked.status).toBe(404);
      expect(db.prepare(`SELECT COUNT(*) AS n FROM story_views`).get()).toEqual({ n: 0 });
    });

    it('getUserStories returns nothing across a block', async () => {
      addStory('s1', 'friend');
      const before = await parseJsonResponse(
        await storiesRoutes.getUserStories(req('/stories/user/friend'), env, 'friend')
      );
      expect(before.data.stories).toHaveLength(1);
      relate(ME, 'friend', 'block');
      const after = await parseJsonResponse(
        await storiesRoutes.getUserStories(req('/stories/user/friend'), env, 'friend')
      );
      expect(after.data.stories).toHaveLength(0);
    });

    it('cron purge removes only stories past the retention window, with their views', async () => {
      addStory('ancient', 'friend', `datetime('now', '-${storiesRoutes.STORY_PURGE_AFTER_DAYS + 1} days')`);
      addStory('recent', 'friend', "datetime('now', '-2 days')");
      db.prepare(
        `INSERT INTO story_views (id, story_id, user_id, viewed_at) VALUES ('v', 'ancient', ?, datetime('now'))`
      ).run(ME);
      expect(await storiesRoutes.purgeExpiredStories(env)).toBe(1);
      expect(db.prepare(`SELECT id FROM stories`).all()).toEqual([{ id: 'recent' }]);
      expect(db.prepare(`SELECT COUNT(*) AS n FROM story_views`).get()).toEqual({ n: 0 });
    });
  });
});
