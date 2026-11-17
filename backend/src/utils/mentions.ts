/**
 * @mentions and #tags (migration 0039).
 *
 * Parsing is pure (tested directly). On post / comment create the routes call
 * recordPostMentions / recordCommentMentions, which resolve usernames, store
 * post_mentions / comment_mentions / post_tags and notify mentioned people.
 * Never throws: a mention side-effect must not fail the post or comment.
 */
import type { Env } from '../types';
import { generateId } from './id';

export const MAX_MENTIONS_PER_ITEM = 10;
export const MAX_TAGS_PER_POST = 20;
/** Several comments mentioning the same person in a burst notify once. */
const COMMENT_MENTION_COALESCE_MINUTES = 10;
const IN_CHUNK = 50;

/**
 * @username: letters, digits, _ and . (2–30), not preceded by a word char, '.',
 * '@' or '/' (so emails and URLs are not mentions). Leading/trailing dots are
 * treated as punctuation ("thanks @lea." → lea).
 */
const MENTION_RE = /(^|[^\p{L}\p{N}_.@/])@([A-Za-z0-9_.]{2,32})(?![A-Za-z0-9_.@])/gu;
const USERNAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_.]{1,29}$/;

/**
 * #tag: unicode letters / marks / digits / _ (2–40), at least one letter, not
 * preceded by a word char, '&', '#' or '/' (URL fragments, HTML entities).
 */
const TAG_RE = /(^|[^\p{L}\p{M}\p{N}_&#/])#([\p{L}\p{M}\p{N}_]{2,40})(?![\p{L}\p{M}\p{N}_])/gu;
const HAS_LETTER_RE = /\p{L}/u;

function cleanUsername(raw: string): string | null {
  const trimmed = raw.replace(/^\.+/, '').replace(/\.+$/, '');
  return USERNAME_RE.test(trimmed) ? trimmed.toLowerCase() : null;
}

/** Unique lowercased usernames mentioned in `text`, in order, max `limit`. */
export function parseMentions(text: string | null | undefined, limit = MAX_MENTIONS_PER_ITEM): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const m of text.matchAll(MENTION_RE)) {
    const u = cleanUsername(m[2]);
    if (!u || out.includes(u)) continue;
    out.push(u);
    if (out.length >= limit) break;
  }
  return out;
}

/** Unique lowercased tags (without '#') in `text`, in order, max `limit`. */
export function parseTags(text: string | null | undefined, limit = MAX_TAGS_PER_POST): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const m of text.matchAll(TAG_RE)) {
    const tag = m[2].normalize('NFC').toLowerCase();
    if (!HAS_LETTER_RE.test(tag) || out.includes(tag)) continue;
    out.push(tag);
    if (out.length >= limit) break;
  }
  return out;
}

function chunk<T>(items: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(', ');
}

function parseMeta(raw: string | null | undefined): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || '{}');
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Respect the recipient's notification settings (metadata.notifications_prefs). */
export function allowsMentionNotifications(meta: Record<string, unknown>): boolean {
  const prefs = meta.notifications_prefs;
  if (!prefs || typeof prefs !== 'object') return true;
  const p = prefs as Record<string, unknown>;
  return p.notificationsEnabled !== false && p.mentions !== false;
}

type Resolved = { id: string; meta: Record<string, unknown> };

/** usernames (lowercased) → users. Uses idx_users_username_lower. */
export async function resolveUsernames(env: Env, usernames: string[]): Promise<Resolved[]> {
  const out: Resolved[] = [];
  for (const part of chunk(usernames)) {
    const rows = await env.DB.prepare(
      `SELECT id, metadata FROM users
       WHERE lower(json_extract(metadata, '$.username')) IN (${placeholders(part.length)})`
    )
      .bind(...part)
      .all<{ id: string; metadata: string | null }>();
    for (const r of rows.results || []) out.push({ id: r.id, meta: parseMeta(r.metadata) });
  }
  return out;
}

/** Ids in `ids` that have a block in either direction with `userId`. */
export async function blockedAmong(env: Env, userId: string, ids: string[]): Promise<Set<string>> {
  const blocked = new Set<string>();
  for (const part of chunk(ids)) {
    const ph = placeholders(part.length);
    const rows = await env.DB.prepare(
      `SELECT target_user_id AS uid FROM user_relationships
         WHERE type = 'block' AND user_id = ? AND target_user_id IN (${ph})
       UNION
       SELECT user_id AS uid FROM user_relationships
         WHERE type = 'block' AND target_user_id = ? AND user_id IN (${ph})`
    )
      .bind(userId, ...part, userId, ...part)
      .all<{ uid: string }>();
    for (const r of rows.results || []) blocked.add(r.uid);
  }
  return blocked;
}

function snippet(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 140 ? `${t.slice(0, 137)}...` : t;
}

async function authorName(env: Env, authorId: string): Promise<string> {
  const row = await env.DB.prepare('SELECT metadata FROM users WHERE id = ?')
    .bind(authorId)
    .first<{ metadata: string | null }>();
  const meta = parseMeta(row?.metadata);
  return typeof meta.username === 'string' && meta.username.trim() ? meta.username.trim() : 'Someone';
}

async function storeTags(env: Env, postId: string, tags: string[]): Promise<void> {
  if (!tags.length) return;
  for (const part of chunk(tags, 40)) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO post_tags (post_id, tag, created_at)
       VALUES ${part.map(() => `(?, ?, datetime('now'))`).join(', ')}`
    )
      .bind(...part.flatMap((t) => [postId, t]))
      .run();
  }
}

type MentionTarget =
  | { kind: 'post'; postId: string }
  | { kind: 'comment'; postId: string; commentId: string; postAuthorId?: string | null };

async function recordMentions(
  env: Env,
  target: MentionTarget,
  authorId: string,
  text: string
): Promise<string[]> {
  const usernames = parseMentions(text);
  if (!usernames.length) return [];

  const resolved = (await resolveUsernames(env, usernames)).filter((u) => u.id !== authorId);
  if (!resolved.length) return [];
  const blocked = await blockedAmong(
    env,
    authorId,
    resolved.map((u) => u.id)
  );
  const targets = resolved.filter((u) => !blocked.has(u.id)).slice(0, MAX_MENTIONS_PER_ITEM);
  if (!targets.length) return [];

  // Mention rows (≤ 10 per item → ≤ 50 params).
  if (target.kind === 'post') {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO post_mentions (post_id, mentioned_user_id, author_id, created_at)
       VALUES ${targets.map(() => `(?, ?, ?, datetime('now'))`).join(', ')}`
    )
      .bind(...targets.flatMap((u) => [target.postId, u.id, authorId]))
      .run();
  } else {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO comment_mentions (comment_id, post_id, mentioned_user_id, author_id, created_at)
       VALUES ${targets.map(() => `(?, ?, ?, ?, datetime('now'))`).join(', ')}`
    )
      .bind(...targets.flatMap((u) => [target.commentId, target.postId, u.id, authorId]))
      .run();
  }

  const name = await authorName(env, authorId);
  const title =
    target.kind === 'post' ? `${name} mentioned you` : `${name} mentioned you in a comment`;
  const body = snippet(text);

  for (const u of targets) {
    if (!allowsMentionNotifications(u.meta)) continue;
    // The post author already gets "commented on your post" for this comment.
    if (target.kind === 'comment' && target.postAuthorId && u.id === target.postAuthorId) continue;
    const dedupeWindow =
      target.kind === 'post'
        ? '' // once per actor + post
        : `AND created_at > datetime('now', '-${COMMENT_MENTION_COALESCE_MINUTES} minutes')`;
    await env.DB.prepare(
      `INSERT INTO user_notifications
         (id, user_id, actor_id, type, title, body, ref_type, ref_id, created_at)
       SELECT ?, ?, ?, 'mention', ?, ?, 'post', ?, datetime('now')
       WHERE NOT EXISTS (
         SELECT 1 FROM user_notifications
         WHERE user_id = ? AND actor_id = ? AND type = 'mention' AND ref_id = ? ${dedupeWindow}
       )`
    )
      .bind(
        generateId('unotif'),
        u.id,
        authorId,
        title,
        body,
        target.postId,
        u.id,
        authorId,
        target.postId
      )
      .run();
  }
  return targets.map((u) => u.id);
}

/** After a post insert: store #tags + @mentions and notify. Never throws. */
export async function recordPostMentions(
  env: Env,
  postId: string,
  authorId: string,
  caption: unknown
): Promise<void> {
  if (typeof caption !== 'string' || !caption) return;
  try {
    await storeTags(env, postId, parseTags(caption));
    await recordMentions(env, { kind: 'post', postId }, authorId, caption);
  } catch (err) {
    console.error('[recordPostMentions]', err);
  }
}

/** After a comment insert: store @mentions and notify. Never throws. */
export async function recordCommentMentions(
  env: Env,
  commentId: string,
  postId: string,
  authorId: string,
  content: unknown,
  postAuthorId?: string | null
): Promise<void> {
  if (typeof content !== 'string' || !content) return;
  try {
    await recordMentions(env, { kind: 'comment', postId, commentId, postAuthorId }, authorId, content);
  } catch (err) {
    console.error('[recordCommentMentions]', err);
  }
}
