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
import { dmPolicyAllows, getDmPolicy, DM_POLICY_REJECTED_MESSAGE } from '../utils/dmPolicy';
import { maybeSendAwayReply } from './wave3/bizengage';

/** Max messages per page (also bounds the reactions lookup). */
export const MAX_MESSAGES_PAGE = 100;

/**
 * Recipient's dm_policy ('everyone' | 'friends' | 'nobody') applied to starting a
 * conversation or sending a message. Active coaching channels are exempt (a paid /
 * in-progress coaching relationship must keep working).
 *
 * Business accounts: a customer writing to a business only hits 'nobody' (a shop's
 * 'friends' setting would lock out every customer, so it reads as 'everyone'). A
 * business replying to a customer who already wrote to them is not held to the
 * customer's policy — they started the thread.
 */
export async function dmPolicyAllowsSender(
  env: Env,
  senderId: string,
  recipientId: string,
  senderIsBusiness?: boolean
): Promise<boolean> {
  const senderBiz = senderIsBusiness ?? (await isBusinessUser(env, senderId));
  const recipientBiz = await isBusinessUser(env, recipientId);
  if (recipientBiz && !senderBiz) {
    if ((await getDmPolicy(env, recipientId)) !== 'nobody') return true;
  } else if (senderBiz && !recipientBiz && (await peerHasWrittenTo(env, recipientId, senderId))) {
    return true;
  } else if (await dmPolicyAllows(env, recipientId, () => areFriends(env, senderId, recipientId))) {
    return true;
  }
  return hasCoachingChannel(env, senderId, recipientId);
}

async function dmPolicyRejection(
  env: Env,
  senderId: string,
  recipientId: string,
  senderIsBusiness?: boolean
): Promise<Response | null> {
  if (await dmPolicyAllowsSender(env, senderId, recipientId, senderIsBusiness)) return null;
  return error('DM_NOT_ALLOWED', DM_POLICY_REJECTED_MESSAGE, 403);
}

export type MessagingReason = 'ok' | 'blocked' | 'not_accepting' | 'unavailable';

/**
 * Full "may sender open / write to this DM" check (channel + recipient policy), with a
 * reason for UI copy. Used by the storefront viewer flag and the business order contact.
 */
export async function messagingAccess(
  env: Env,
  senderId: string,
  recipientId: string,
  sender?: { is_business?: boolean | number } | null
): Promise<MessagingReason> {
  if (!senderId || !recipientId || senderId === recipientId) return 'unavailable';
  if (await isBlocked(env, senderId, recipientId)) return 'blocked';
  const senderBiz = sender ? !!sender.is_business : await isBusinessUser(env, senderId);
  if (!(await canMessagePeer(env, senderId, recipientId, { is_business: senderBiz }))) return 'unavailable';
  if (!(await dmPolicyAllowsSender(env, senderId, recipientId, senderBiz))) return 'not_accepting';
  return 'ok';
}

async function isBusinessUser(env: Env, userId: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT is_business FROM users WHERE id = ?')
    .bind(userId)
    .first<{ is_business: number | null }>();
  return !!row?.is_business;
}

/** Has `authorId` sent at least one message in their conversation with `peerId`? */
async function peerHasWrittenTo(env: Env, authorId: string, peerId: string): Promise<boolean> {
  const [a, b] = orderedPair(authorId, peerId);
  const row = await env.DB.prepare(
    `SELECT 1 AS ok FROM messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE c.user_a = ? AND c.user_b = ? AND m.sender_id = ? LIMIT 1`
  )
    .bind(a, b, authorId)
    .first<{ ok: number }>();
  return !!row;
}

/** Window in which a product question or save lets a business reach out first. */
export const BUSINESS_OUTREACH_WINDOW_DAYS = 30;

/**
 * A business may write to a customer only when there is a reason to: an existing
 * conversation, an order, or a product question / save within the last 30 days.
 */
async function businessCanReachCustomer(env: Env, businessId: string, customerId: string): Promise<boolean> {
  const [a, b] = orderedPair(businessId, customerId);
  const conversation = await env.DB.prepare(
    'SELECT id FROM conversations WHERE user_a = ? AND user_b = ? LIMIT 1'
  )
    .bind(a, b)
    .first<{ id: string }>();
  if (conversation) return true;

  const orderLink = await env.DB.prepare(
    `SELECT o.id
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     WHERE o.user_id = ? AND p.user_id = ?
     LIMIT 1`
  )
    .bind(customerId, businessId)
    .first<{ id: string }>();
  if (orderLink) return true;

  const since = new Date(Date.now() - BUSINESS_OUTREACH_WINDOW_DAYS * 86400000).toISOString();
  try {
    const interest = await env.DB.prepare(
      `SELECT 1 AS ok FROM product_questions
        WHERE asker_id = ? AND business_id = ? AND created_at >= ?
       UNION ALL
       SELECT 1 AS ok FROM product_saves
        WHERE user_id = ? AND business_id = ? AND created_at >= ?
       LIMIT 1`
    )
      .bind(customerId, businessId, since, customerId, businessId, since)
      .first<{ ok: number }>();
    return !!interest;
  } catch {
    // Wave 6 tables missing on an older DB: no extra channels.
    return false;
  }
}

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
  deleted_at?: string | null;
  /** JSON flags (migration 0050), e.g. {"auto":true}; absent on older DBs. */
  metadata?: string | null;
};

/** True for automatic messages (business away replies). */
export function isAutoMessage(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    return JSON.parse(raw)?.auto === true;
  } catch {
    return false;
  }
}

/** Preview text for an unsent last message in the inbox. */
export const UNSENT_PREVIEW = 'Message unsent';

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

/**
 * Is there a messaging channel between `userId` and `peerId`? Blocks (either way) win;
 * then friends, coaching, and the shop rules: anyone may write to a business account,
 * and a business may write to a customer it has a reason to (see businessCanReachCustomer).
 * The recipient's dm_policy is checked separately (dmPolicyAllowsSender).
 */
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
  const senderBiz = user ? !!user.is_business : await isBusinessUser(env, userId);
  if (!senderBiz) return isBusinessUser(env, peerId);
  return businessCanReachCustomer(env, userId, peerId);
}

/** D1 caps bound parameters per statement; keep IN (...) lists comfortably below it. */
export const IN_CHUNK = 90;

export function chunk<T>(items: T[], size = IN_CHUNK): T[][] {
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

  // Every caller passes peers it already shares a conversation with. For a business an
  // existing conversation is itself the channel; for everyone else, business peers are open.
  const remaining = peers.filter((id) => !allowed.has(id));
  if (user?.is_business) {
    for (const id of remaining) allowed.add(id);
  } else {
    for (const ids of chunk(remaining)) {
      const placeholders = ids.map(() => '?').join(',');
      const businesses = await env.DB.prepare(
        `SELECT id FROM users WHERE is_business = 1 AND id IN (${placeholders})`
      )
        .bind(...ids)
        .all<{ id: string }>();
      for (const r of businesses.results || []) allowed.add(r.id);
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
        -- Unsend clears the body (sends are never empty), so '' marks an unsent message
        -- without touching deleted_at — the inbox keeps working before migration 0040.
        (SELECT CASE WHEN m.body = '' THEN '${UNSENT_PREVIEW}' ELSE m.body END FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
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
  const policyRejection = await dmPolicyRejection(env, ctx.userId, targetUserId, !!ctx.user?.is_business);
  if (policyRejection) return policyRejection;

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
  const limit = Math.max(1, Math.min(Number.isFinite(rawLimit) ? rawLimit : 50, MAX_MESSAGES_PAGE));
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

    // Unsent messages come back as a body-less placeholder the client renders as "Message unsent".
    const messages = ordered.map((m) =>
      m.deleted_at
        ? {
            id: m.id,
            conversation_id: m.conversation_id,
            sender_id: m.sender_id,
            created_at: m.created_at,
            is_own: m.sender_id === ctx.userId,
            deleted: true as const,
          }
        : {
            id: m.id,
            conversation_id: m.conversation_id,
            sender_id: m.sender_id,
            body: m.body,
            created_at: m.created_at,
            is_own: m.sender_id === ctx.userId,
            reactions: reactionMap[m.id] || { counts: {}, mine: null },
            ...(isAutoMessage(m.metadata) ? { auto: true as const } : {}),
          }
    );

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
  // Whitespace-only bodies would store '' (which marks an unsent message).
  if (!validation.data.body.trim()) {
    return error('VALIDATION_ERROR', 'Message cannot be empty', 400);
  }

  const conversation = await getConversationForUser(env, conversationId, ctx.userId);
  if (!conversation) {
    return error('NOT_FOUND', 'Conversation not found', 404);
  }

  const peerId = peerIdFor(conversation, ctx.userId);
  if (!(await canMessagePeer(env, ctx.userId, peerId, ctx.user))) {
    return error('FORBIDDEN', 'You can only message friends', 403);
  }
  const policyRejection = await dmPolicyRejection(env, ctx.userId, peerId, !!ctx.user?.is_business);
  if (policyRejection) return policyRejection;

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

    // Business away message (once per conversation per 12 h; never throws).
    await maybeSendAwayReply(env, conversationId, ctx.userId, peerId);

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

export async function loadReactionsForMessages(
  env: Env,
  messageIds: string[],
  userId: string
): Promise<Record<string, ReactionBundle>> {
  const out: Record<string, ReactionBundle> = {};
  if (messageIds.length === 0) return out;
  try {
    for (const ids of chunk(Array.from(new Set(messageIds)))) {
      const placeholders = ids.map(() => '?').join(',');
      const rows = await env.DB.prepare(
        `SELECT message_id, user_id, emoji FROM message_reactions WHERE message_id IN (${placeholders})`
      )
        .bind(...ids)
        .all<{ message_id: string; user_id: string; emoji: string }>();
      for (const row of rows.results || []) {
        const bucket = out[row.message_id] || { counts: {}, mine: null };
        bucket.counts[row.emoji] = (bucket.counts[row.emoji] || 0) + 1;
        if (row.user_id === userId) bucket.mine = row.emoji;
        out[row.message_id] = bucket;
      }
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

  // SELECT * so a DB without migration 0040 (no deleted_at column) still works.
  const message = await env.DB.prepare('SELECT * FROM messages WHERE id = ? AND conversation_id = ?')
    .bind(messageId, conversationId)
    .first<{ id: string; deleted_at?: string | null }>();
  if (!message || message.deleted_at) {
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

/**
 * DELETE /api/v1/messages/conversations/:id/messages/:messageId  (unsend)
 * Sender only. Soft delete: deleted_at set, body cleared, reactions dropped.
 * Idempotent: unsending an already-unsent message returns the same placeholder.
 */
export async function unsendMessage(
  request: Request,
  env: Env,
  conversationId: string,
  messageId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const conversation = await getConversationForUser(env, conversationId, ctx.userId);
  if (!conversation) {
    return error('NOT_FOUND', 'Conversation not found', 404);
  }

  const message = await env.DB.prepare('SELECT * FROM messages WHERE id = ? AND conversation_id = ?')
    .bind(messageId, conversationId)
    .first<{ id: string; sender_id: string; deleted_at: string | null }>();
  if (!message) {
    return error('NOT_FOUND', 'Message not found', 404);
  }
  if (message.sender_id !== ctx.userId) {
    return error('FORBIDDEN', 'You can only unsend your own messages', 403);
  }

  try {
    if (!message.deleted_at) {
      const now = new Date().toISOString();
      await env.DB.prepare(
        `UPDATE messages SET body = '', deleted_at = ? WHERE id = ? AND sender_id = ?`
      )
        .bind(now, messageId, ctx.userId)
        .run();
      try {
        await env.DB.prepare('DELETE FROM message_reactions WHERE message_id = ?').bind(messageId).run();
      } catch {
        /* reactions table missing on a stale DB */
      }
    }
    return json({ id: messageId, deleted: true });
  } catch (err) {
    console.error('[unsendMessage]', err);
    return error('DATABASE_ERROR', 'Could not unsend that message', 500);
  }
}
