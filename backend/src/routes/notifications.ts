import type { Env } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';

type NotifRow = {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: string;
  title: string;
  body: string | null;
  ref_type: string | null;
  ref_id: string | null;
  read_at: string | null;
  created_at: string;
  actor_metadata?: string | null;
  post_image?: string | null;
  post_caption?: string | null;
  post_category?: string | null;
  post_subcategory?: string | null;
  post_user_id?: string | null;
  seed_title?: string | null;
  seed_stage?: string | null;
  seed_category?: string | null;
  seed_subcategory?: string | null;
  group_name?: string | null;
  group_path?: string | null;
};

function parseActor(row: NotifRow) {
  if (!row.actor_id) return null;
  let username = 'Someone';
  let avatar: string | null = null;
  try {
    const meta = JSON.parse(row.actor_metadata || '{}') as {
      username?: string;
      avatar?: string;
    };
    if (typeof meta.username === 'string' && meta.username.trim()) username = meta.username.trim();
    if (typeof meta.avatar === 'string') avatar = meta.avatar;
  } catch {
    /* ignore */
  }
  return { id: row.actor_id, username, avatar };
}

function mapPreview(row: NotifRow) {
  if (row.ref_type === 'post' || row.type === 'post_like') {
    if (row.post_image || row.post_caption) {
      return {
        kind: 'post' as const,
        image: row.post_image || null,
        title: (row.post_caption || '').trim() || 'Post',
        subtitle: row.post_category || null,
        category: row.post_category || null,
      };
    }
  }
  if (row.ref_type === 'growth_seed') {
    if (row.seed_title) {
      return {
        kind: 'seed' as const,
        image: null,
        title: row.seed_title,
        subtitle: row.seed_stage || 'seed',
        category: row.seed_category
          ? `${row.seed_category}${row.seed_subcategory ? `:${row.seed_subcategory}` : ''}`
          : null,
      };
    }
  }
  if (row.ref_type === 'growth_group' || row.type === 'group_join' || row.type === 'group_invite') {
    if (row.group_name) {
      return {
        kind: 'group' as const,
        image: null,
        title: row.group_name,
        subtitle: row.group_path || 'circle',
        category: row.group_path || null,
      };
    }
  }
  if (row.actor_id) {
    return {
      kind: 'person' as const,
      image: null,
      title: parseActor(row)?.username || 'Someone',
      subtitle: row.type.replace(/_/g, ' '),
      category: null,
    };
  }
  return null;
}

function mapNotification(row: NotifRow) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    ref_type: row.ref_type,
    ref_id: row.ref_id,
    read_at: row.read_at,
    created_at: row.created_at,
    unread: !row.read_at,
    actor: parseActor(row),
    preview: mapPreview(row),
  };
}

/**
 * GET /api/v1/notifications
 */
export async function listNotifications(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '40', 10) || 40, 80);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10) || 0;

  try {
    const listSql = [
      `SELECT n.*, u.metadata AS actor_metadata,
              p.image_url AS post_image, p.caption AS post_caption,
              p.category AS post_category, p.subcategory AS post_subcategory,
              p.user_id AS post_user_id,
              gs.title AS seed_title, gs.stage AS seed_stage,
              gs.category_key AS seed_category, gs.subcategory_key AS seed_subcategory,
              gg.name AS group_name, gg.path_key AS group_path
       FROM user_notifications n
       LEFT JOIN users u ON u.id = n.actor_id
       LEFT JOIN posts p ON (n.ref_type = 'post' OR n.type = 'post_like') AND p.id = n.ref_id
       LEFT JOIN growth_seeds gs ON n.ref_type = 'growth_seed' AND gs.id = n.ref_id
       LEFT JOIN growth_groups gg ON n.ref_type = 'growth_group' AND gg.id = n.ref_id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC
       LIMIT ? OFFSET ?`,
      `SELECT n.*, u.metadata AS actor_metadata,
              p.image_url AS post_image, p.caption AS post_caption,
              p.category AS post_category, p.subcategory AS post_subcategory,
              p.user_id AS post_user_id,
              gs.title AS seed_title, gs.stage AS seed_stage,
              gs.category_key AS seed_category, gs.subcategory_key AS seed_subcategory
       FROM user_notifications n
       LEFT JOIN users u ON u.id = n.actor_id
       LEFT JOIN posts p ON (n.ref_type = 'post' OR n.type = 'post_like') AND p.id = n.ref_id
       LEFT JOIN growth_seeds gs ON n.ref_type = 'growth_seed' AND gs.id = n.ref_id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC
       LIMIT ? OFFSET ?`,
      `SELECT n.*, u.metadata AS actor_metadata,
              p.image_url AS post_image, p.caption AS post_caption,
              p.category AS post_category, p.subcategory AS post_subcategory,
              p.user_id AS post_user_id
       FROM user_notifications n
       LEFT JOIN users u ON u.id = n.actor_id
       LEFT JOIN posts p ON (n.ref_type = 'post' OR n.type = 'post_like') AND p.id = n.ref_id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC
       LIMIT ? OFFSET ?`,
      `SELECT n.*, u.metadata AS actor_metadata
       FROM user_notifications n
       LEFT JOIN users u ON u.id = n.actor_id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC
       LIMIT ? OFFSET ?`,
    ];

    let rows: { results?: NotifRow[] } | null = null;
    let lastErr: unknown;
    for (const sql of listSql) {
      try {
        rows = await env.DB.prepare(sql).bind(ctx.userId, limit, offset).all<NotifRow>();
        lastErr = null;
        break;
      } catch (joinErr: unknown) {
        lastErr = joinErr;
        const joinMsg = joinErr instanceof Error ? joinErr.message : String(joinErr);
        if (!joinMsg.includes('no such table')) throw joinErr;
      }
    }
    if (!rows) throw lastErr;

    const unreadRow = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM user_notifications
       WHERE user_id = ? AND read_at IS NULL`
    )
      .bind(ctx.userId)
      .first<{ c: number }>();

    return json({
      notifications: (rows.results || []).map(mapNotification),
      unread_count: Number(unreadRow?.c) || 0,
      limit,
      offset,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('no such table')) {
      return json({ notifications: [], unread_count: 0, limit, offset });
    }
    console.error('[listNotifications]', err);
    return error('DATABASE_ERROR', 'Failed to load notifications', 500);
  }
}

/**
 * GET /api/v1/notifications/unread-count
 */
export async function unreadCount(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM user_notifications
       WHERE user_id = ? AND read_at IS NULL`
    )
      .bind(ctx.userId)
      .first<{ c: number }>();
    return json({ unread_count: Number(row?.c) || 0 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('no such table')) return json({ unread_count: 0 });
    console.error('[unreadCount]', err);
    return error('DATABASE_ERROR', 'Failed to load unread count', 500);
  }
}

/**
 * PATCH /api/v1/notifications/:id/read
 */
export async function markRead(
  request: Request,
  env: Env,
  notificationId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    const row = await env.DB.prepare(
      `SELECT id FROM user_notifications WHERE id = ? AND user_id = ?`
    )
      .bind(notificationId, ctx.userId)
      .first();
    if (!row) return error('NOT_FOUND', 'Notification not found', 404);

    await env.DB.prepare(
      `UPDATE user_notifications SET read_at = datetime('now')
       WHERE id = ? AND read_at IS NULL`
    )
      .bind(notificationId)
      .run();

    return json({ ok: true });
  } catch (err) {
    console.error('[markRead]', err);
    return error('DATABASE_ERROR', 'Failed to mark read', 500);
  }
}

/**
 * POST /api/v1/notifications/read-all
 */
export async function markAllRead(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    await env.DB.prepare(
      `UPDATE user_notifications SET read_at = datetime('now')
       WHERE user_id = ? AND read_at IS NULL`
    )
      .bind(ctx.userId)
      .run();
    return json({ ok: true });
  } catch (err) {
    console.error('[markAllRead]', err);
    return error('DATABASE_ERROR', 'Failed to mark all read', 500);
  }
}
