import { Env } from '../../types';
import { json, error } from '../../utils/response';
import { requireAdmin } from '../../utils/adminAuth';

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function listAuditLogs(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'audit.read');
  if (ctx instanceof Response) return ctx;
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const action = url.searchParams.get('action') || '';

  let query = `SELECT l.*, a.email as admin_email FROM admin_audit_logs l
               JOIN admin_users a ON a.id = l.admin_id WHERE 1=1`;
  const bindings: unknown[] = [];
  if (action) {
    query += ` AND l.action LIKE ?`;
    bindings.push(`%${action}%`);
  }
  query += ` ORDER BY l.created_at DESC LIMIT ? OFFSET ?`;
  bindings.push(limit, offset);

  const rows = await env.DB.prepare(query).bind(...bindings).all();
  return json({
    logs: (rows.results || []).map((l: any) => ({
      ...l,
      metadata: parseJson(l.metadata, {}),
    })),
    limit,
    offset,
  });
}
