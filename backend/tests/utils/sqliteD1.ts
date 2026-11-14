/**
 * Minimal in-memory D1 stand-in backed by node:sqlite, so route tests run real SQL
 * (ordering, cursors, NOT EXISTS filters) instead of string-matching mocks.
 */
import { createRequire } from 'node:module';

// Loaded via require: Vite's resolver does not know the newer `node:sqlite` builtin.
// Typed locally because the installed @types/node predates node:sqlite.
type SqliteStatement = {
  get: (...args: unknown[]) => unknown;
  all: (...args: unknown[]) => unknown[];
  run: (...args: unknown[]) => { changes: number | bigint };
};
type SqliteDatabase = { exec: (sql: string) => void; prepare: (sql: string) => SqliteStatement };
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => SqliteDatabase;
};

type Bindable = string | number | bigint | null | Uint8Array;

function normalize(args: unknown[]): Bindable[] {
  return args.map((a) => {
    if (a === undefined) return null;
    if (typeof a === 'boolean') return a ? 1 : 0;
    return a as Bindable;
  });
}

export function createSqliteD1(schema: string) {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);

  const statement = (sql: string, args: unknown[] = []) => ({
    bind: (...next: unknown[]) => statement(sql, next),
    first: async <T = Record<string, unknown>>(col?: string): Promise<T | null> => {
      const row = db.prepare(sql).get(...normalize(args)) as Record<string, unknown> | undefined;
      if (!row) return null;
      return (col ? row[col] : row) as T;
    },
    all: async <T = Record<string, unknown>>() => ({
      results: db.prepare(sql).all(...normalize(args)) as T[],
      success: true,
    }),
    run: async () => {
      const res = db.prepare(sql).run(...normalize(args));
      return { success: true, meta: { changes: Number(res.changes) } };
    },
  });

  return {
    raw: db,
    d1: { prepare: (sql: string) => statement(sql) },
  };
}

/** Subset of the production schema used by the social routes. */
export const SOCIAL_SCHEMA = `
CREATE TABLE users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL DEFAULT '',
  points INTEGER DEFAULT 0, is_instructor INTEGER DEFAULT 0, is_business INTEGER DEFAULT 0,
  metadata TEXT DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE user_account_states (user_id TEXT PRIMARY KEY, status TEXT, suspended_until TEXT);
CREATE TABLE user_relationships (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, target_user_id TEXT NOT NULL, type TEXT NOT NULL,
  source TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, target_user_id, type)
);
CREATE TABLE conversations (
  id TEXT PRIMARY KEY, user_a TEXT NOT NULL, user_b TEXT NOT NULL, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, last_message_at TEXT, user_a_last_read_at TEXT, user_b_last_read_at TEXT,
  UNIQUE(user_a, user_b)
);
CREATE TABLE messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, sender_id TEXT NOT NULL,
  body TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE message_reactions (
  message_id TEXT NOT NULL, user_id TEXT NOT NULL, emoji TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id)
);
CREATE TABLE posts (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, image_url TEXT, caption TEXT,
  category TEXT NOT NULL DEFAULT 'art', subcategory TEXT, engagement_score INTEGER DEFAULT 0,
  metadata TEXT DEFAULT '{}', is_hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE post_engagement (
  id TEXT PRIMARY KEY, post_id TEXT NOT NULL, user_id TEXT NOT NULL, type TEXT NOT NULL,
  content TEXT, created_at TEXT NOT NULL
);
CREATE TABLE stories (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, image_url TEXT NOT NULL, caption TEXT,
  views INTEGER DEFAULT 0, expires_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE story_views (
  id TEXT PRIMARY KEY, story_id TEXT NOT NULL, user_id TEXT NOT NULL, viewed_at TEXT NOT NULL,
  UNIQUE(story_id, user_id)
);
CREATE TABLE user_notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, actor_id TEXT, type TEXT NOT NULL, title TEXT NOT NULL,
  body TEXT, ref_type TEXT, ref_id TEXT, read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * Full production schema: every migration in order (also proves the chain applies
 * cleanly on a fresh SQLite). `upTo` stops before the named migration file.
 */
export function loadMigrationsSql(opts: { upTo?: string; only?: string } = {}): string {
  const req = createRequire(import.meta.url);
  const fs = req('node:fs') as typeof import('node:fs');
  const path = req('node:path') as typeof import('node:path');
  const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../migrations');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => (opts.only ? f === opts.only : !opts.upTo || f < opts.upTo))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    .join('\n');
}

/** Wraps a D1 stand-in and records the largest number of bound params seen. */
export function trackParams<T extends { prepare: (sql: string) => any }>(d1: T) {
  const stats = { maxParams: 0, maxSql: '' };
  const wrap = (stmt: any, sql: string): any => ({
    ...stmt,
    bind: (...args: unknown[]) => {
      if (args.length > stats.maxParams) {
        stats.maxParams = args.length;
        stats.maxSql = sql;
      }
      return wrap(stmt.bind(...args), sql);
    },
  });
  return { d1: { prepare: (sql: string) => wrap(d1.prepare(sql), sql) }, stats };
}
