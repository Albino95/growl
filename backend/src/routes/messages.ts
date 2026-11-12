import { Env } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { generateId } from '../utils/id';
import { areFriends, isBlocked } from './friends';
import {
  validateRequest,
  createConversationSchema,
  sendMessageSchema,
  reactToMessageSchema,
  MESSAGE_REACTION_EMOJIS,
} from '../utils/validation';
import { coachingConversationIds, hasCoachingChannel } from '../utils/coachingAccess';

type ConversationRow = {
  id: string;
  user_a: string;
  user_b: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  user_a_last_read_at?: string | null;
  user_b_last_read_at?: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function peerIdFor(conversation: ConversationRow, userId: string): string {
  return conversation.user_a === userId ? conversation.user_b : conversation.user_a;
}

function myLastReadAt(conversation: ConversationRow, userId: string): string | null {
  return conversation.user_a === userId
    ? conversation.user_a_last_read_at || null
    : conversation.user_b_last_read_at || null;
}

async function markConversationRead(env: Env, conversation: ConversationRow, userId: string) {
  const now = new Date().toISOString();
  if (conversation.user_a === userId) {
    await env.DB.prepare(`UPDATE conversations SET user_a_last_read_at = ? WHERE id = ?`)
      .bind(now, conversation.id)
      .run();
  } else {
    await env.DB.prepare(`UPDATE conversations SET user_b_last_read_at = ? WHERE id = ?`)
      .bind(now, conversation.id)
      .run();
  }
}

async function getConversationForUser(
  env: Env,
  conversationId: string,
  userId: string
): Promise<ConversationRow | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM conversations WHERE id = ? AND (user_a = ? OR user_b = ?)`
  )
    .bind(conversationId, userId, userId)
    .first<ConversationRow>();
  return row ?? null;
}

function parseUserMeta(raw: string | undefined) {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

export async function canMessagePeer(
  env: Env,
  userId: string,
  peerId: string,
  user?: { is_business?: boolean | number } | null
): Promise<boolean> {
  // Blocks win over every other channel (friend edge, coaching, shop order).
  if (await isBlocked(env, userId, peerId)) return false;
  if (await areFriends(env, userId, peerId)) return true;
  if (await hasCoachingChannel(env, userId, peerId)) return true;
  if (!user?.is_business) return false;

  const orderLink = await env.DB.prepare(
    `SELECT o.id
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     WHERE o.user_id = ? AND p.user_id = ?
     LIMIT 1`
  )
    .bind(peerId, userId)
    .first<{ id: string }>();

  return !!orderLink;
}

/** D1 caps bound parameters per statement; keep IN (...) lists comfortably below it. */
const IN_CHUNK = 90;

function chunk<T>(items: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Batched equivalent of canMessagePeer for many peers at once (inbox list + badge).
 * A fixed handful of queries instead of 3-4 per conversation.
 */
async function loadMessagingAccess(
  env: Env,
  userId: string,
  peerIds: string[],
  user?: { is_business?: boolean | number } | null
): Promise<{ blocked: Set<string>; allowed: Set<string> }> {
  const blocked = new Set<string>();
  const allowed = new Set<string>();
  const peers = Array.from(new Set(peerIds.filter((id) => id && id !== userId)));
  if (peers.length === 0) return { blocked, allowed };

  const rels = await env.DB.prepare(
    `SELECT user_id, target_user_id, type FROM user_relationships
     WHERE type IN ('friend', 'block') AND (user_id = ? OR target_user_id = ?)`
  )
    .bind(userId, userId)
    .all<{ user_id: string; target_user_id: string; type: string }>();
  for (const r of rels.results || []) {
    const other = r.user_id === userId ? r.target_user_id : r.user_id;
    if (r.type === 'block') blocked.add(other);
    else allowed.add(other);
  }

  try {
    const coaching = await env.DB.prepare(
      `SELECT CASE WHEN instructor_id = ? THEN client_id ELSE instructor_id END AS peer_id
         FROM coaching_inquiries
        WHERE (instructor_id = ? OR client_id = ?) AND status IN ('pending', 'talking')
       UNION
       SELECT CASE WHEN instructor_id = ? THEN client_id ELSE instructor_id END AS peer_id
         FROM coaching_proposals
        WHERE (instructor_id = ? OR client_id = ?) AND status = 'sent'
       UNION
       SELECT CASE WHEN instructor_id = ? THEN client_id ELSE instructor_id END AS peer_id
         FROM coaching_contracts
        WHERE (instructor_id = ? OR client_id = ?) AND status = 'active'`
    )
      .bind(userId, userId, userId, userId, userId, userId, userId, userId, userId)
      .all<{ peer_id: string }>();
    for (const r of coaching.results || []) if (r.peer_id) allowed.add(r.peer_id);
  } catch {
    /* coaching tables missing on a stale DB — same fallback as hasCoachingChannel */
  }

  if (user?.is_business) {
    const remaining = peers.filter((id) => !allowed.has(id));
    for (const ids of chunk(remaining)) {
      const placeholders = ids.map(() => '?').join(',');
      const buyers = await env.DB.prepare(
        `SELECT DISTINCT o.user_id AS peer_id
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN products p ON p.id = oi.product_id
         WHERE p.user_id = ? AND o.user_id IN (${placeholders})`
      )
        .bind(userId, ...ids)
        .all<{ peer_id: string }>();
      for (const r of buyers.results || []) allowed.add(r.peer_id);
    }
  }

  for (const id of blocked) allowed.delete(id);
  return { blocked, allowed };
}

type PeerRow = { id: string; metadata: string; is_instructor: number; is_business: number };

async function loadPeers(env: Env, peerIds: string[]): Promise<Map<string, PeerRow>> {
  const map = new Map<string, PeerRow>();
  for (const ids of chunk(Array.from(new Set(peerIds)))) {
    const placeholders = ids.map(() => '?').join(',');
    const rows = await env.DB.prepare(
      `SELECT id, metadata, is_instructor, is_business FROM users WHERE id IN (${placeholders})`
    )
      .bind(...ids)
      .all<PeerRow>();
    for (const r of rows.results || []) map.set(r.id, r);
  }
  return map;
}

/** Unread only when the peer actually sent something after my read watermark. */
function isUnread(
  row: ConversationRow & { last_sender_id: string | null },
  userId: string
): boolean {
  const lastAt = row.last_message_at;
  if (!lastAt || !row.last_sender_id) return false;
  if (row.last_sender_id === userId) return false;
  const readAt = myLastReadAt(row, userId);
  return !readAt || new Date(lastAt).getTime() > new Date(readAt).getTime();
}

/** Shared by hire reach-out so a coaching inquiry can open a thread without a friend edge. */
export async function findOrCreateConversation(
  env: Env,
  userId: string,
  peerId: string
): Promise<ConversationRow> {
  const [userA, userB] = orderedPair(userId, peerId);
  const now = new Date().toISOString();
  let conversation = await env.DB.prepare(
    'SELECT * FROM conversations WHERE user_a = ? AND user_b = ?'
  )
    .bind(userA, userB)
    .first<ConversationRow>();

  if (!conversation) {
    const id = generateId('conv');
    await env.DB.prepare(
      `INSERT INTO conversations (id, user_a, user_b, created_at, updated_at, last_message_at)
       VALUES (?, ?, ?, ?, ?, NULL)`
    )
      .bind(id, userA, userB, now, now)
      .run();
    conversation = await env.DB.prepare('SELECT * FROM conversations WHERE id = ?')
      .bind(id)
      .first<ConversationRow>();
  }

  if (!conversation) {
    throw new Error('Failed to create conversation');
  }
  return conversation;
}

/**
 * GET /api/v1/messages/conversations
 * Friend-only conversations for the authenticated user.
 */
export async function getConversations(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    const rows = await env.DB.prepare(
      `SELECT c.*,
        (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
        (SELECT sender_id FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_sender_id
       FROM conversations c
       WHERE c.user_a = ? OR c.user_b = ?
       ORDER BY COALESCE(c.last_message_at, c.updated_at) DESC`
    )
      .bind(ctx.userId, ctx.userId)
      .all<ConversationRow & { last_message: string | null; last_sender_id: string | null }>();

    const list = rows.results || [];
    const coachingIds = await coachingConversationIds(env, ctx.userId);
    const peerIds = list.map((row) => peerIdFor(row, ctx.userId!));
    const access = await loadMessagingAccess(env, ctx.userId, peerIds, ctx.user);
    const peers = await loadPeers(env, peerIds);

    const conversations = [];
    for (const row of list) {
      const peerId = peerIdFor(row, ctx.userId);
      const coaching = coachingIds.has(row.id);
      if (access.blocked.has(peerId)) continue;
      if (!coaching && !access.allowed.has(peerId)) continue;

      const peer = peers.get(peerId);
      if (!peer) continue;

      const meta = parseUserMeta(peer.metadata);
      const lastAt = row.last_message_at || row.updated_at;

      conversations.push({
        id: row.id,
        peer: {
          id: peer.id,
          username: meta.username || 'User',
          avatar: meta.avatar || null,
          is_instructor: !!peer.is_instructor,
          is_business: !!peer.is_business,
        },
        coaching,
        last_message: row.last_message,
        last_sender_id: row.last_sender_id,
        last_message_at: lastAt,
        unread: isUnread(row, ctx.userId),
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    }

    return json({ conversations });
  } catch (err) {
    console.error('[getConversations]', err);
    return error('DATABASE_ERROR', 'Failed to fetch conversations', 500);
  }
}

/**
 * GET /api/v1/messages/unread-count
 * Count of conversations with unread messages for the badge.
 */
export async function unreadCount(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    const rows = await env.DB.prepare(
      `SELECT c.*,
        (SELECT sender_id FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_sender_id
       FROM conversations c
       WHERE c.user_a = ? OR c.user_b = ?`
    )
      .bind(ctx.userId, ctx.userId)
      .all<ConversationRow & { last_sender_id: string | null }>();

    const list = rows.results || [];
    const coachingIds = await coachingConversationIds(env, ctx.userId);
    const candidates = list.filter((row) => isUnread(row, ctx.userId!));
    const access = await loadMessagingAccess(
      env,
      ctx.userId,
      candidates.map((row) => peerIdFor(row, ctx.userId!)),
      ctx.user
    );
    let count = 0;
    for (const row of candidates) {
      const peerId = peerIdFor(row, ctx.userId);
      if (access.blocked.has(peerId)) continue;
      if (!coachingIds.has(row.id) && !access.allowed.has(peerId)) continue;
      count += 1;
    }

    return json({ unread_count: count });
  } catch (err) {
    console.error('[messages.unreadCount]', err);
    return json({ unread_count: 0 });
  }
}

/**
 * POST /api/v1/messages/conversations
 * Create or return existing conversation with a friend.
 */
export async function createConversation(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const validation = await validateRequest(request, createConversationSchema);
  if (!validation.success) return validation.response;

  const { targetUserId } = validation.data;
  if (targetUserId === ctx.userId) {
    return error('INVALID_REQUEST', 'Cannot message yourself', 400);
  }

  const target = await env.DB.prepare(
    'SELECT id, metadata, is_instructor, is_business FROM users WHERE id = ?'
  )
    .bind(targetUserId)
    .first<{ id: string; metadata: string; is_instructor: number; is_business: number }>();

  if (!target) {
    return error('NOT_FOUND', 'User not found', 404);
  }

  let canMessage = await canMessagePeer(env, ctx.userId, targetUserId, ctx.user);
  if (!canMessage) {
    return error('FORBIDDEN', 'You can only message friends', 403);
  }

  try {
    const conversation = await findOrCreateConversation(env, ctx.userId, targetUserId);
    const coaching = (await coachingConversationIds(env, ctx.userId)).has(conversation.id);
    const meta = parseUserMeta(target.metadata);
    return json({
      conversation: {
        id: conversation.id,
        peer: {
          id: target.id,
          username: meta.username || 'User',
          avatar: meta.avatar || null,
          is_instructor: !!target.is_instructor,
          is_business: !!target.is_business,
        },
        coaching,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
        last_message_at: conversation.last_message_at,
      },
      created: conversation.created_at === conversation.updated_at,
    });
  } catch (err) {
    console.error('[createConversation]', err);
    return error('DATABASE_ERROR', 'Failed to create conversation', 500);
  }
}

/**
 * GET /api/v1/messages/conversations/:conversationId/messages
 */
export async function getMessages(
  request: Request,
  env: Env,
  conversationId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const conversation = await getConversationForUser(env, conversationId, ctx.userId);
  if (!conversation) {
    return error('NOT_FOUND', 'Conversation not found', 404);
  }

  const peerId = peerIdFor(conversation, ctx.userId);
  if (!(await canMessagePeer(env, ctx.userId, peerId, ctx.user))) {
    return error('FORBIDDEN', 'You can only message friends', 403);
  }

  const params = new URL(request.url).searchParams;
  const rawLimit = parseInt(params.get('limit') || '50', 10);
  const limit = Math.max(1, Math.min(Number.isFinite(rawLimit) ? rawLimit : 50, 200));
  // Keyset cursor for older pages: messages strictly older than (before, before_id).
  const before = (params.get('before') || '').trim() || null;
  const beforeId = (params.get('before_id') || '').trim() || null;

  try {
    const cursorSql = before
      ? beforeId
        ? 'AND (created_at < ? OR (created_at = ? AND id < ?))'
        : 'AND created_at < ?'
      : '';
    const cursorArgs = before ? (beforeId ? [before, before, beforeId] : [before]) : [];
    // Newest page first (DESC), then flipped to chronological order for the client.
    const rows = await env.DB.prepare(
      `SELECT * FROM messages
       WHERE conversation_id = ? ${cursorSql}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
      .bind(conversationId, ...cursorArgs, limit + 1)
      .all<MessageRow>();

    const page = rows.results || [];
    const hasMore = page.length > limit;
    const ordered = page.slice(0, limit).reverse();

    // Loading older history does not move the read watermark.
    if (!before) await markConversationRead(env, conversation, ctx.userId);

    // Re-read peer watermark after our mark so concurrent peer reads are not stale.
    const fresh = await getConversationForUser(env, conversationId, ctx.userId);
    const peerReadAt =
      (fresh || conversation).user_a === ctx.userId
        ? (fresh || conversation).user_b_last_read_at || null
        : (fresh || conversation).user_a_last_read_at || null;

    const ids = ordered.map((m) => m.id);
    const reactionMap = await loadReactionsForMessages(env, ids, ctx.userId);

    const messages = ordered.map((m) => ({
      id: m.id,
      conversation_id: m.conversation_id,
      sender_id: m.sender_id,
      body: m.body,
      created_at: m.created_at,
      is_own: m.sender_id === ctx.userId,
      reactions: reactionMap[m.id] || { counts: {}, mine: null },
    }));

    const oldest = ordered[0];
    return json({
      messages,
      peer_last_read_at: peerReadAt,
      limit,
      has_more: hasMore,
      next_before: hasMore && oldest ? { before: oldest.created_at, before_id: oldest.id } : null,
    });
  } catch (err) {
    console.error('[getMessages]', err);
    return error('DATABASE_ERROR', 'Failed to fetch messages', 500);
  }
}

/**
 * POST /api/v1/messages/conversations/:conversationId/messages
 */
export async function sendMessage(
  request: Request,
  env: Env,
  conversationId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const validation = await validateRequest(request, sendMessageSchema);
  if (!validation.success) return validation.response;

  const conversation = await getConversationForUser(env, conversationId, ctx.userId);
  if (!conversation) {
    return error('NOT_FOUND', 'Conversation not found', 404);
  }

  const peerId = peerIdFor(conversation, ctx.userId);
  if (!(await canMessagePeer(env, ctx.userId, peerId, ctx.user))) {
    return error('FORBIDDEN', 'You can only message friends', 403);
  }

  const now = new Date().toISOString();
  const id = generateId('msg');

  try {
    await env.DB.prepare(
      `INSERT INTO messages (id, conversation_id, sender_id, body, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(id, conversationId, ctx.userId, validation.data.body.trim(), now)
      .run();

    await env.DB.prepare(
      `UPDATE conversations SET updated_at = ?, last_message_at = ? WHERE id = ?`
    )
      .bind(now, now, conversationId)
      .run();

    const row = await env.DB.prepare('SELECT * FROM messages WHERE id = ?')
      .bind(id)
      .first<MessageRow>();

    return json(
      {
        id: row!.id,
        conversation_id: row!.conversation_id,
        sender_id: row!.sender_id,
        body: row!.body,
        created_at: row!.created_at,
        is_own: true,
        reactions: { counts: {}, mine: null },
      },
      201
    );
  } catch (err) {
    console.error('[sendMessage]', err);
    return error('DATABASE_ERROR', 'Failed to send message', 500);
  }
}

type ReactionBundle = {
  counts: Record<string, number>;
  mine: string | null;
};

async function loadReactionsForMessages(
  env: Env,
  messageIds: string[],
  userId: string
): Promise<Record<string, ReactionBundle>> {
  const out: Record<string, ReactionBundle> = {};
  if (messageIds.length === 0) return out;
  try {
    const placeholders = messageIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(
      `SELECT message_id, user_id, emoji FROM message_reactions WHERE message_id IN (${placeholders})`
    )
      .bind(...messageIds)
      .all<{ message_id: string; user_id: string; emoji: string }>();
    for (const row of rows.results || []) {
      const bucket = out[row.message_id] || { counts: {}, mine: null };
      bucket.counts[row.emoji] = (bucket.counts[row.emoji] || 0) + 1;
      if (row.user_id === userId) bucket.mine = row.emoji;
      out[row.message_id] = bucket;
    }
  } catch {
    /* table may not exist yet on a stale worker */
  }
  return out;
}

/**
 * PUT /api/v1/messages/conversations/:id/messages/:messageId/reaction
 * Toggle: same emoji clears, different emoji replaces.
 */
export async function reactToMessage(
  request: Request,
  env: Env,
  conversationId: string,
  messageId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const validation = await validateRequest(request, reactToMessageSchema);
  if (!validation.success) return validation.response;

  const conversation = await getConversationForUser(env, conversationId, ctx.userId);
  if (!conversation) {
    return error('NOT_FOUND', 'Conversation not found', 404);
  }
  const peerId = peerIdFor(conversation, ctx.userId);
  if (!(await canMessagePeer(env, ctx.userId, peerId, ctx.user))) {
    return error('FORBIDDEN', 'You can only message friends', 403);
  }

  const message = await env.DB.prepare(
    'SELECT id FROM messages WHERE id = ? AND conversation_id = ?'
  )
    .bind(messageId, conversationId)
    .first<{ id: string }>();
  if (!message) {
    return error('NOT_FOUND', 'Message not found', 404);
  }

  const emoji = validation.data.emoji;
  if (!(MESSAGE_REACTION_EMOJIS as readonly string[]).includes(emoji)) {
    return error('INVALID_REQUEST', 'Unknown reaction', 400);
  }

  const now = new Date().toISOString();
  try {
    const existing = await env.DB.prepare(
      'SELECT emoji FROM message_reactions WHERE message_id = ? AND user_id = ?'
    )
      .bind(messageId, ctx.userId)
      .first<{ emoji: string }>();

    if (existing?.emoji === emoji) {
      await env.DB.prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?')
        .bind(messageId, ctx.userId)
        .run();
    } else if (existing) {
      await env.DB.prepare(
        'UPDATE message_reactions SET emoji = ?, created_at = ? WHERE message_id = ? AND user_id = ?'
      )
        .bind(emoji, now, messageId, ctx.userId)
        .run();
    } else {
      await env.DB.prepare(
        `INSERT INTO message_reactions (message_id, user_id, emoji, created_at)
         VALUES (?, ?, ?, ?)`
      )
        .bind(messageId, ctx.userId, emoji, now)
        .run();
    }

    const map = await loadReactionsForMessages(env, [messageId], ctx.userId);
    return json({ reactions: map[messageId] || { counts: {}, mine: null } });
  } catch (err) {
    console.error('[reactToMessage]', err);
    return error('DATABASE_ERROR', 'Failed to react', 500);
  }
}
