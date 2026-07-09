import { Env } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { generateId } from '../utils/id';
import {
  validateRequest,
  createJournalEntrySchema,
  updateJournalEntrySchema,
} from '../utils/validation';

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
        JSON.stringify(metadata ?? {}),
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
