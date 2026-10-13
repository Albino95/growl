import { Env } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { generateId } from '../utils/id';
import {
  validateRequest,
  createJournalEntrySchema,
  updateJournalEntrySchema,
} from '../utils/validation';
import { getFriendUserIds } from './friends';

type JournalRow = {
  id: string;
  user_id: string;
  title: string | null;
  content: string;
  mood: string | null;
  tags: string;
  is_public: number;
  metadata: string;
  created_at: string;
  updated_at: string;
};

function formatJournalEntry(row: JournalRow) {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    content: row.content,
    mood: row.mood,
    tags: JSON.parse(row.tags || '[]'),
    is_public: row.is_public === 1,
    isPublic: row.is_public === 1,
    metadata: JSON.parse(row.metadata || '{}'),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * GET /api/v1/journal/entries
 * List authenticated user's journal entries.
 */
export async function getJournalEntries(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const url = new URL(request.url);
  const scope = url.searchParams.get('scope') || 'mine';
  const visibility = url.searchParams.get('visibility');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  let query: string;
  const bindings: (string | number)[] = [];

  if (scope === 'public') {
    query = 'SELECT * FROM journal_entries WHERE is_public = 1';
  } else {
    query = 'SELECT * FROM journal_entries WHERE user_id = ?';
    bindings.push(ctx.userId);
    if (visibility === 'public') {
      query += ' AND is_public = 1';
    } else if (visibility === 'private') {
      query += ' AND is_public = 0';
    }
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  bindings.push(limit, offset);

  try {
    const rows = await env.DB.prepare(query).bind(...bindings).all<JournalRow>();
    const entries = (rows.results || []).map(formatJournalEntry);
    return json({ entries, total: entries.length, limit, offset });
  } catch (err) {
    console.error('[getJournalEntries]', err);
    return error('DATABASE_ERROR', 'Failed to fetch journal entries', 500);
  }
}

/**
 * GET /api/v1/journal/entries/user/:userId
 * Public journal entries for a profile.
 */
export async function getUserPublicJournalEntries(
  request: Request,
  env: Env,
  targetUserId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const limit = Math.min(parseInt(new URL(request.url).searchParams.get('limit') || '50', 10), 100);
  const offset = parseInt(new URL(request.url).searchParams.get('offset') || '0', 10);

  try {
    const rows = await env.DB.prepare(
      `SELECT * FROM journal_entries
       WHERE user_id = ? AND is_public = 1
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(targetUserId, limit, offset)
      .all<JournalRow>();

    const entries = (rows.results || []).map(formatJournalEntry);
    return json({ entries, total: entries.length, limit, offset });
  } catch (err) {
    console.error('[getUserPublicJournalEntries]', err);
    return error('DATABASE_ERROR', 'Failed to fetch public journal entries', 500);
  }
}

/**
 * POST /api/v1/journal/entries
 */
export async function createJournalEntry(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const validation = await validateRequest(request, createJournalEntrySchema);
  if (!validation.success) return validation.response;

  const { title, content, mood, tags, is_public, metadata } = validation.data;
  const now = new Date().toISOString();
  const id = generateId('journal');
  const meta = {
    ...(metadata && typeof metadata === 'object' ? metadata : {}),
    // Public circle entries invite conversation unless author opts out later.
    ...(is_public ? { allowMessages: true } : {}),
  };

  try {
    await env.DB.prepare(
      `INSERT INTO journal_entries (id, user_id, title, content, mood, tags, is_public, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        ctx.userId,
        title ?? null,
        content,
        mood ?? null,
        JSON.stringify(tags ?? []),
        is_public ? 1 : 0,
        JSON.stringify(meta),
        now,
        now
      )
      .run();

    const row = await env.DB.prepare('SELECT * FROM journal_entries WHERE id = ?')
      .bind(id)
      .first<JournalRow>();

    if (!row) {
      return error('DATABASE_ERROR', 'Failed to create journal entry', 500);
    }

    return json(formatJournalEntry(row), 201);
  } catch (err) {
    console.error('[createJournalEntry]', err);
    return error('DATABASE_ERROR', 'Failed to create journal entry', 500);
  }
}

/**
 * PUT /api/v1/journal/entries/:entryId
 */
export async function updateJournalEntry(
  request: Request,
  env: Env,
  entryId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const validation = await validateRequest(request, updateJournalEntrySchema);
  if (!validation.success) return validation.response;

  try {
    const existing = await env.DB.prepare('SELECT * FROM journal_entries WHERE id = ?')
      .bind(entryId)
      .first<JournalRow>();

    if (!existing) {
      return error('NOT_FOUND', 'Journal entry not found', 404);
    }
    if (existing.user_id !== ctx.userId) {
      return error('FORBIDDEN', 'You can only edit your own journal entries', 403);
    }

    const data = validation.data;
    const now = new Date().toISOString();

    await env.DB.prepare(
      `UPDATE journal_entries SET
         title = ?,
         content = ?,
         mood = ?,
         tags = ?,
         is_public = ?,
         metadata = ?,
         updated_at = ?
       WHERE id = ?`
    )
      .bind(
        data.title !== undefined ? data.title : existing.title,
        data.content !== undefined ? data.content : existing.content,
        data.mood !== undefined ? data.mood : existing.mood,
        data.tags !== undefined ? JSON.stringify(data.tags) : existing.tags,
        data.is_public !== undefined ? (data.is_public ? 1 : 0) : existing.is_public,
        data.metadata !== undefined ? JSON.stringify(data.metadata) : existing.metadata,
        now,
        entryId
      )
      .run();

    const row = await env.DB.prepare('SELECT * FROM journal_entries WHERE id = ?')
      .bind(entryId)
      .first<JournalRow>();

    return json(formatJournalEntry(row!));
  } catch (err) {
    console.error('[updateJournalEntry]', err);
    return error('DATABASE_ERROR', 'Failed to update journal entry', 500);
  }
}

/**
 * DELETE /api/v1/journal/entries/:entryId
 */
export async function deleteJournalEntry(
  request: Request,
  env: Env,
  entryId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    const existing = await env.DB.prepare('SELECT user_id FROM journal_entries WHERE id = ?')
      .bind(entryId)
      .first<{ user_id: string }>();

    if (!existing) {
      return error('NOT_FOUND', 'Journal entry not found', 404);
    }
    if (existing.user_id !== ctx.userId) {
      return error('FORBIDDEN', 'You can only delete your own journal entries', 403);
    }

    await env.DB.prepare('DELETE FROM journal_entries WHERE id = ?').bind(entryId).run();
    return json({ ok: true, id: entryId });
  } catch (err) {
    console.error('[deleteJournalEntry]', err);
    return error('DATABASE_ERROR', 'Failed to delete journal entry', 500);
  }
}

function mutedJournalIdsFromMetadata(metadataJson: string | null | undefined): Set<string> {
  try {
    const meta = JSON.parse(metadataJson || '{}') as { mutedJournalUserIds?: unknown };
    const list = Array.isArray(meta.mutedJournalUserIds) ? meta.mutedJournalUserIds : [];
    return new Set(list.map((x) => String(x)).filter(Boolean));
  } catch {
    return new Set();
  }
}

/**
 * GET /api/v1/journal/reflections
 * Public replies sitting on the viewer's own shared journal pages.
 */
export async function getJournalReflections(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const limit = Math.min(parseInt(new URL(request.url).searchParams.get('limit') || '30', 10), 50);

  try {
    const rows = await env.DB.prepare(
      `SELECT r.id, r.entry_id, r.user_id, r.quote_text, r.body, r.created_at,
              e.content AS entry_content, e.created_at AS entry_created_at,
              u.metadata AS author_metadata, u.email AS author_email
       FROM journal_entry_replies r
       INNER JOIN journal_entries e ON e.id = r.entry_id
       INNER JOIN users u ON u.id = r.user_id
       WHERE e.user_id = ?
         AND e.is_public = 1
         AND r.visibility = 'public'
       ORDER BY r.created_at DESC
       LIMIT ?`
    )
      .bind(ctx.userId, limit)
      .all<{
        id: string;
        entry_id: string;
        user_id: string;
        quote_text: string;
        body: string;
        created_at: string;
        entry_content: string;
        entry_created_at: string;
        author_metadata: string;
        author_email: string;
      }>();

    const reflections = (rows.results || []).map((row) => {
      let meta: Record<string, unknown> = {};
      try {
        meta = JSON.parse(row.author_metadata || '{}');
      } catch {
        meta = {};
      }
      const username =
        (typeof meta.username === 'string' && meta.username.trim()) ||
        row.author_email?.split('@')[0] ||
        row.user_id.slice(0, 8);
      return {
        id: row.id,
        entry_id: row.entry_id,
        user_id: row.user_id,
        username,
        avatar: (meta.avatar as string | null) ?? null,
        quote_text: row.quote_text,
        body: row.body,
        created_at: row.created_at,
        entry_excerpt:
          row.entry_content.length > 120
            ? `${row.entry_content.slice(0, 117).trim()}…`
            : row.entry_content,
        entry_created_at: row.entry_created_at,
      };
    });

    return json({ reflections, total: reflections.length });
  } catch (err) {
    console.error('[getJournalReflections]', err);
    return error('DATABASE_ERROR', 'Failed to load reflections', 500);
  }
}

/**
 * GET /api/v1/journal/circle
 * Friends' public journals, interaction-weighted (DM peers first), excluding muted authors.
 */
export async function getCircleJournalEntries(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const limit = Math.min(parseInt(new URL(request.url).searchParams.get('limit') || '40', 10), 60);

  try {
    const me = await env.DB.prepare('SELECT metadata FROM users WHERE id = ?')
      .bind(ctx.userId)
      .first<{ metadata: string }>();
    const muted = mutedJournalIdsFromMetadata(me?.metadata);

    const friendIds = [...(await getFriendUserIds(env, ctx.userId))].filter((id) => !muted.has(id));
    if (friendIds.length === 0) {
      return json({ entries: [], total: 0, limit });
    }

    const placeholders = friendIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(
      `SELECT j.*, u.metadata AS author_metadata, u.email AS author_email
       FROM journal_entries j
       INNER JOIN users u ON u.id = j.user_id
       WHERE j.is_public = 1
         AND j.user_id IN (${placeholders})
       ORDER BY j.created_at DESC
       LIMIT ?`
    )
      .bind(...friendIds, Math.max(limit * 3, 60))
      .all<
        JournalRow & {
          author_metadata: string;
          author_email: string;
        }
      >();

    // Warmth score: recent DM peers rank higher than cold friends.
    const warmPeers = new Set<string>();
    try {
      const dmRows = await env.DB.prepare(
        `SELECT CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END AS peer_id
         FROM conversations c
         WHERE (c.user_a = ? OR c.user_b = ?)
           AND datetime(c.updated_at) > datetime('now', '-45 days')
         LIMIT 80`
      )
        .bind(ctx.userId, ctx.userId, ctx.userId)
        .all<{ peer_id: string }>();
      for (const r of dmRows.results || []) {
        if (r.peer_id) warmPeers.add(r.peer_id);
      }
    } catch {
      /* conversations table may differ — fall back to recency only */
    }

    const feltRows = await env.DB.prepare(
      `SELECT entry_id FROM journal_reactions WHERE user_id = ? AND type = 'felt'`
    )
      .bind(ctx.userId)
      .all<{ entry_id: string }>();
    const feltIds = new Set((feltRows.results || []).map((r) => r.entry_id));

    type CircleHit = ReturnType<typeof formatJournalEntry> & {
      username: string;
      avatar: string | null;
      feltThis: boolean;
      allowMessages: boolean;
      warmth: number;
    };

    const scored: CircleHit[] = [];
    for (const row of rows.results || []) {
      let authorMeta: Record<string, unknown> = {};
      try {
        authorMeta = JSON.parse(row.author_metadata || '{}');
      } catch {
        authorMeta = {};
      }
      const username =
        (typeof authorMeta.username === 'string' && authorMeta.username.trim()) ||
        row.author_email?.split('@')[0] ||
        row.user_id.slice(0, 8);
      const entryMeta = (() => {
        try {
          return JSON.parse(row.metadata || '{}') as { allowMessages?: boolean };
        } catch {
          return {};
        }
      })();
      const allowMessages = entryMeta.allowMessages !== false;
      const formatted = formatJournalEntry(row);
      scored.push({
        ...formatted,
        username,
        avatar: (authorMeta.avatar as string | null) ?? null,
        feltThis: feltIds.has(row.id),
        allowMessages,
        warmth: warmPeers.has(row.user_id) ? 1 : 0,
      });
    }

    scored.sort((a, b) => {
      if (a.warmth !== b.warmth) return b.warmth - a.warmth;
      return a.created_at < b.created_at ? 1 : -1;
    });

    const entries = scored.slice(0, limit).map(({ warmth: _w, ...rest }) => rest);
    return json({ entries, total: entries.length, limit });
  } catch (err) {
    console.error('[getCircleJournalEntries]', err);
    return error('DATABASE_ERROR', 'Failed to fetch circle journals', 500);
  }
}

/**
 * POST /api/v1/journal/entries/:entryId/feel
 * Soft "Felt this" reaction (idempotent).
 */
export async function feelJournalEntry(
  request: Request,
  env: Env,
  entryId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    const entry = await env.DB.prepare(
      'SELECT id, user_id, is_public FROM journal_entries WHERE id = ?'
    )
      .bind(entryId)
      .first<{ id: string; user_id: string; is_public: number }>();
    if (!entry || entry.is_public !== 1) {
      return error('NOT_FOUND', 'Public journal entry not found', 404);
    }
    if (entry.user_id === ctx.userId) {
      return error('VALIDATION_ERROR', 'You cannot react to your own entry', 400);
    }

    const friends = await getFriendUserIds(env, ctx.userId);
    if (!friends.has(entry.user_id)) {
      return error('FORBIDDEN', 'Only friends can react to circle journals', 403);
    }

    const existing = await env.DB.prepare(
      `SELECT id FROM journal_reactions WHERE entry_id = ? AND user_id = ? AND type = 'felt'`
    )
      .bind(entryId, ctx.userId)
      .first<{ id: string }>();

    if (!existing) {
      await env.DB.prepare(
        `INSERT INTO journal_reactions (id, entry_id, user_id, type, created_at)
         VALUES (?, ?, ?, 'felt', datetime('now'))`
      )
        .bind(generateId('jfeel'), entryId, ctx.userId)
        .run();
    }

    return json({ ok: true, entryId, feltThis: true });
  } catch (err) {
    console.error('[feelJournalEntry]', err);
    return error('DATABASE_ERROR', 'Failed to save reaction', 500);
  }
}

/**
 * GET /api/v1/journal/entries/:entryId/replies
 * Public replies on a circle journal entry (friends of author / readers).
 */
export async function listJournalReplies(
  request: Request,
  env: Env,
  entryId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    const entry = await env.DB.prepare(
      'SELECT id, user_id, is_public FROM journal_entries WHERE id = ?'
    )
      .bind(entryId)
      .first<{ id: string; user_id: string; is_public: number }>();
    if (!entry || entry.is_public !== 1) {
      return error('NOT_FOUND', 'Public journal entry not found', 404);
    }

    const rows = await env.DB.prepare(
      `SELECT r.id, r.entry_id, r.user_id, r.quote_text, r.body, r.visibility, r.created_at,
              u.metadata AS author_metadata, u.email AS author_email
       FROM journal_entry_replies r
       INNER JOIN users u ON u.id = r.user_id
       WHERE r.entry_id = ? AND r.visibility = 'public'
       ORDER BY r.created_at ASC
       LIMIT 100`
    )
      .bind(entryId)
      .all<{
        id: string;
        entry_id: string;
        user_id: string;
        quote_text: string;
        body: string;
        visibility: string;
        created_at: string;
        author_metadata: string;
        author_email: string;
      }>();

    const replies = (rows.results || []).map((row) => {
      let meta: Record<string, unknown> = {};
      try {
        meta = JSON.parse(row.author_metadata || '{}');
      } catch {
        meta = {};
      }
      const username =
        (typeof meta.username === 'string' && meta.username.trim()) ||
        row.author_email?.split('@')[0] ||
        row.user_id.slice(0, 8);
      return {
        id: row.id,
        entry_id: row.entry_id,
        user_id: row.user_id,
        quote_text: row.quote_text,
        body: row.body,
        visibility: row.visibility,
        created_at: row.created_at,
        username,
        avatar: (meta.avatar as string | null) ?? null,
      };
    });

    return json({ replies, total: replies.length });
  } catch (err) {
    console.error('[listJournalReplies]', err);
    return error('DATABASE_ERROR', 'Failed to load replies', 500);
  }
}

/**
 * POST /api/v1/journal/entries/:entryId/replies
 * Body: { quote_text, body, visibility?: 'public' | 'private' }
 * Private = stored for audit but intended to open DM; public = circle thread.
 */
export async function createJournalReply(
  request: Request,
  env: Env,
  entryId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  let body: { quote_text?: string; body?: string; visibility?: string };
  try {
    body = await request.json();
  } catch {
    return error('INVALID_JSON', 'Invalid JSON', 400);
  }

  const quote = typeof body.quote_text === 'string' ? body.quote_text.trim() : '';
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  const visibility = body.visibility === 'private' ? 'private' : 'public';
  if (quote.length < 1 || quote.length > 500) {
    return error('VALIDATION_ERROR', 'Select a short sentence to reply to', 400);
  }
  if (text.length < 1 || text.length > 1000) {
    return error('VALIDATION_ERROR', 'Reply must be 1–1000 characters', 400);
  }

  try {
    const entry = await env.DB.prepare(
      'SELECT id, user_id, is_public, content FROM journal_entries WHERE id = ?'
    )
      .bind(entryId)
      .first<{ id: string; user_id: string; is_public: number; content: string }>();
    if (!entry || entry.is_public !== 1) {
      return error('NOT_FOUND', 'Public journal entry not found', 404);
    }
    if (entry.user_id === ctx.userId) {
      return error('VALIDATION_ERROR', 'Reply to friends’ entries from Circle', 400);
    }
    const friends = await getFriendUserIds(env, ctx.userId);
    if (!friends.has(entry.user_id)) {
      return error('FORBIDDEN', 'Only friends can reply on circle journals', 403);
    }
    // Soft check: quote should appear in entry (allow slight truncation)
    const hay = entry.content.toLowerCase();
    const needle = quote.toLowerCase().slice(0, 40);
    if (needle && !hay.includes(needle)) {
      return error('VALIDATION_ERROR', 'That line is not in this entry', 400);
    }

    const id = generateId('jreply');
    await env.DB.prepare(
      `INSERT INTO journal_entry_replies (id, entry_id, user_id, quote_text, body, visibility, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(id, entryId, ctx.userId, quote, text, visibility)
      .run();

    return json(
      {
        id,
        entry_id: entryId,
        user_id: ctx.userId,
        quote_text: quote,
        body: text,
        visibility,
        created_at: new Date().toISOString(),
      },
      201
    );
  } catch (err) {
    console.error('[createJournalReply]', err);
    return error('DATABASE_ERROR', 'Failed to save reply', 500);
  }
}

/**
 * POST /api/v1/journal/mute
 * Mute someone's journals in Circle without unfriending. Body: { userId, muted: boolean }
 */
export async function muteJournalAuthor(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }
  if (request.method !== 'POST') {
    return error('METHOD_NOT_ALLOWED', 'Use POST', 405);
  }

  let body: { userId?: string; muted?: boolean };
  try {
    body = await request.json();
  } catch {
    return error('INVALID_JSON', 'Invalid JSON', 400);
  }
  const targetUserId = typeof body.userId === 'string' ? body.userId.trim() : '';
  const muted = body.muted !== false;
  if (!targetUserId || targetUserId === ctx.userId) {
    return error('VALIDATION_ERROR', 'Valid userId required', 400);
  }

  try {
    const me = await env.DB.prepare('SELECT metadata FROM users WHERE id = ?')
      .bind(ctx.userId)
      .first<{ metadata: string }>();
    if (!me) return error('NOT_FOUND', 'User not found', 404);

    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(me.metadata || '{}');
    } catch {
      meta = {};
    }
    const prev = Array.isArray(meta.mutedJournalUserIds)
      ? meta.mutedJournalUserIds.map((x) => String(x))
      : [];
    const next = muted
      ? Array.from(new Set([...prev, targetUserId]))
      : prev.filter((id) => id !== targetUserId);
    meta.mutedJournalUserIds = next;

    await env.DB.prepare(
      `UPDATE users SET metadata = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(JSON.stringify(meta), ctx.userId)
      .run();

    return json({ ok: true, userId: targetUserId, muted, mutedJournalUserIds: next });
  } catch (err) {
    console.error('[muteJournalAuthor]', err);
    return error('DATABASE_ERROR', 'Failed to update mute', 500);
  }
}
