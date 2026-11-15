-- Wave 3 search (GET /search): FTS5 indexes for people and posts.
--
-- Both indexes are ordinary FTS5 tables (they keep their own copy of the indexed text, so
-- highlight()/snippet() work) whose rowid mirrors the source row's rowid. Triggers keep them in
-- sync; the search query always joins back to the source row by id, so a stale index row can
-- never surface a deleted user or post.
--
-- Tokenizer: unicode61 with diacritics folded ("cafe" finds "café") and '_' kept inside tokens
-- so usernames like "early_bird" stay one token. Prefix indexes on 1-3 chars make `q*` cheap.
--
-- Note: `wrangler d1 export` does not support virtual tables; drop these before exporting and
-- re-run this migration's backfill afterwards.

-- ---------------------------------------------------------------------------
-- People: username, display_name, bio, paths (metadata.categories).
CREATE VIRTUAL TABLE IF NOT EXISTS search_users USING fts5(
  user_id UNINDEXED,
  username,
  display_name,
  bio,
  paths,
  tokenize = "unicode61 remove_diacritics 2 tokenchars '_'",
  prefix = '1 2 3'
);

INSERT INTO search_users (rowid, user_id, username, display_name, bio, paths)
SELECT
  rowid,
  id,
  COALESCE(json_extract(metadata, '$.username'), ''),
  COALESCE(json_extract(metadata, '$.display_name'), ''),
  COALESCE(json_extract(metadata, '$.bio'), ''),
  COALESCE(json_extract(metadata, '$.categories'), '')
FROM users
WHERE json_valid(COALESCE(metadata, '{}'));

CREATE TRIGGER IF NOT EXISTS search_users_ai AFTER INSERT ON users
WHEN json_valid(COALESCE(new.metadata, '{}'))
BEGIN
  INSERT INTO search_users (rowid, user_id, username, display_name, bio, paths)
  VALUES (
    new.rowid,
    new.id,
    COALESCE(json_extract(new.metadata, '$.username'), ''),
    COALESCE(json_extract(new.metadata, '$.display_name'), ''),
    COALESCE(json_extract(new.metadata, '$.bio'), ''),
    COALESCE(json_extract(new.metadata, '$.categories'), '')
  );
END;

-- Only re-index when a searchable field actually changed (users rows are updated often).
CREATE TRIGGER IF NOT EXISTS search_users_au AFTER UPDATE OF metadata ON users
WHEN json_valid(COALESCE(new.metadata, '{}'))
  AND CASE
    WHEN NOT json_valid(COALESCE(old.metadata, '{}')) THEN 1
    ELSE (
      json_extract(old.metadata, '$.username') IS NOT json_extract(new.metadata, '$.username')
      OR json_extract(old.metadata, '$.display_name') IS NOT json_extract(new.metadata, '$.display_name')
      OR json_extract(old.metadata, '$.bio') IS NOT json_extract(new.metadata, '$.bio')
      OR json_extract(old.metadata, '$.categories') IS NOT json_extract(new.metadata, '$.categories')
    )
  END
BEGIN
  DELETE FROM search_users WHERE rowid = old.rowid;
  INSERT INTO search_users (rowid, user_id, username, display_name, bio, paths)
  VALUES (
    new.rowid,
    new.id,
    COALESCE(json_extract(new.metadata, '$.username'), ''),
    COALESCE(json_extract(new.metadata, '$.display_name'), ''),
    COALESCE(json_extract(new.metadata, '$.bio'), ''),
    COALESCE(json_extract(new.metadata, '$.categories'), '')
  );
END;

CREATE TRIGGER IF NOT EXISTS search_users_ad AFTER DELETE ON users
BEGIN
  DELETE FROM search_users WHERE rowid = old.rowid;
END;

-- ---------------------------------------------------------------------------
-- Posts: caption, category, subcategory, plus `tags` = the caption with every '#' turned into
-- an "ht_" prefix, so "#yoga" is indexed as the token "ht_yoga" and tag prefix search is
-- `tags : "ht_yo"*`. (SQLite has no regex; the exact tag strings are re-extracted in the route.)
CREATE VIRTUAL TABLE IF NOT EXISTS search_posts USING fts5(
  post_id UNINDEXED,
  caption,
  category,
  subcategory,
  tags,
  tokenize = "unicode61 remove_diacritics 2 tokenchars '_'",
  prefix = '1 2 3'
);

INSERT INTO search_posts (rowid, post_id, caption, category, subcategory, tags)
SELECT
  rowid,
  id,
  COALESCE(caption, ''),
  COALESCE(category, ''),
  COALESCE(subcategory, ''),
  CASE WHEN instr(COALESCE(caption, ''), '#') > 0 THEN replace(caption, '#', ' ht_') ELSE '' END
FROM posts;

CREATE TRIGGER IF NOT EXISTS search_posts_ai AFTER INSERT ON posts
BEGIN
  INSERT INTO search_posts (rowid, post_id, caption, category, subcategory, tags)
  VALUES (
    new.rowid,
    new.id,
    COALESCE(new.caption, ''),
    COALESCE(new.category, ''),
    COALESCE(new.subcategory, ''),
    CASE WHEN instr(COALESCE(new.caption, ''), '#') > 0 THEN replace(new.caption, '#', ' ht_') ELSE '' END
  );
END;

CREATE TRIGGER IF NOT EXISTS search_posts_au AFTER UPDATE OF caption, category, subcategory ON posts
BEGIN
  DELETE FROM search_posts WHERE rowid = old.rowid;
  INSERT INTO search_posts (rowid, post_id, caption, category, subcategory, tags)
  VALUES (
    new.rowid,
    new.id,
    COALESCE(new.caption, ''),
    COALESCE(new.category, ''),
    COALESCE(new.subcategory, ''),
    CASE WHEN instr(COALESCE(new.caption, ''), '#') > 0 THEN replace(new.caption, '#', ' ht_') ELSE '' END
  );
END;

CREATE TRIGGER IF NOT EXISTS search_posts_ad AFTER DELETE ON posts
BEGIN
  DELETE FROM search_posts WHERE rowid = old.rowid;
END;
