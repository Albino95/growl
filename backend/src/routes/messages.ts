import { Env } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { generateId } from '../utils/id';
import { areFriends } from './friends';
import { validateRequest, createConversationSchema, sendMessageSchema } from '../utils/validation';

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

async function canMessagePeer(
  env: Env,
  userId: string,
  peerId: string,
  user?: { is_business?: boolean | number } | null
): Promise<boolean> {
  if (await areFriends(env, userId, peerId)) return true;
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

    const conversations = [];
    for (const row of rows.results || []) {
      const peerId = peerIdFor(row, ctx.userId);
      if (!(await canMessagePeer(env, ctx.userId, peerId, ctx.user))) continue;

      const peer = await env.DB.prepare('SELECT id, metadata FROM users WHERE id = ?')
        .bind(peerId)
        .first<{ id: string; metadata: string }>();

      if (!peer) continue;

      const meta = parseUserMeta(peer.metadata);
      const lastAt = row.last_message_at || row.updated_at;
      const lastSender = row.last_sender_id;
      const readAt = myLastReadAt(row, ctx.userId);
      const unread =
        !!lastAt &&
        lastSender !== ctx.userId &&
        (!readAt || new Date(lastAt).getTime() > new Date(readAt).getTime());

      conversations.push({
        id: row.id,
        peer: {
          id: peer.id,
          username: meta.username || 'User',
          avatar: meta.avatar || null,
        },
        last_message: row.last_message,
        last_sender_id: row.last_sender_id,
        last_message_at: lastAt,
        unread,
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

  const target = await env.DB.prepare('SELECT id, metadata FROM users WHERE id = ?')
    .bind(targetUserId)
    .first<{ id: string; metadata: string }>();

  if (!target) {
    return error('NOT_FOUND', 'User not found', 404);
  }

  let canMessage = await canMessagePeer(env, ctx.userId, targetUserId, ctx.user);
  if (!canMessage) {
    return error('FORBIDDEN', 'You can only message friends', 403);
  }

  const [userA, userB] = orderedPair(ctx.userId, targetUserId);
  const now = new Date().toISOString();

  try {
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

    const meta = parseUserMeta(target.metadata);
    return json({
      conversation: {
        id: conversation!.id,
        peer: {
          id: target.id,
          username: meta.username || 'User',
          avatar: meta.avatar || null,
        },
        created_at: conversation!.created_at,
        updated_at: conversation!.updated_at,
        last_message_at: conversation!.last_message_at,
      },
      created: conversation!.created_at === conversation!.updated_at,
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

  const limit = Math.min(parseInt(new URL(request.url).searchParams.get('limit') || '100', 10), 200);
  const offset = parseInt(new URL(request.url).searchParams.get('offset') || '0', 10);

  try {
    const rows = await env.DB.prepare(
      `SELECT * FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC
       LIMIT ? OFFSET ?`
    )
      .bind(conversationId, limit, offset)
      .all<MessageRow>();

    await markConversationRead(env, conversation, ctx.userId);

    const messages = (rows.results || []).map((m) => ({
      id: m.id,
      conversation_id: m.conversation_id,
      sender_id: m.sender_id,
      body: m.body,
      created_at: m.created_at,
      is_own: m.sender_id === ctx.userId,
    }));

    return json({ messages, limit, offset });
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
      },
      201
    );
  } catch (err) {
    console.error('[sendMessage]', err);
    return error('DATABASE_ERROR', 'Failed to send message', 500);
  }
}
