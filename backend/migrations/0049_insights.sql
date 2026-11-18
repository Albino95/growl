-- Wave 6 — Business insights without orders: storefront/product views, saves, link taps,
-- partner tracked links (clicks + saves attributed within 7 days of a click).
-- Raw events are pruned after 90 days by cron; the daily aggregates are kept and are what
-- the insights endpoint reads, so it stays cheap. Additive only.

-- Raw events (no PII beyond the nullable viewer user id).
CREATE TABLE IF NOT EXISTS biz_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,           -- product_view | storefront_view | link_tap | product_save | partner_click
  business_id TEXT NOT NULL,
  product_id TEXT,
  partner_link_id TEXT,
  viewer_id TEXT,               -- users.id, NULL for signed-out viewers
  source TEXT,
  day TEXT NOT NULL,            -- YYYY-MM-DD (UTC)
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_biz_events_business_day ON biz_events(business_id, day);
CREATE INDEX IF NOT EXISTS idx_biz_events_created ON biz_events(created_at);

-- View dedupe: one counted view per viewer + item per 30 minutes. viewer_key is
-- 'u:<userId>' or 'a:<short hash>' for signed-out viewers; rows are pruned hourly.
CREATE TABLE IF NOT EXISTS biz_view_dedupe (
  viewer_key TEXT NOT NULL,
  item_key TEXT NOT NULL,       -- 'p:<productId>' | 's:<businessId>' | 'l:<linkId>'
  last_at TEXT NOT NULL,
  PRIMARY KEY (viewer_key, item_key)
);
CREATE INDEX IF NOT EXISTS idx_biz_view_dedupe_last ON biz_view_dedupe(last_at);

-- Daily aggregates, updated with UPSERT on every accepted event.
CREATE TABLE IF NOT EXISTS product_daily_stats (
  product_id TEXT NOT NULL,
  day TEXT NOT NULL,
  business_id TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, day)
);
CREATE INDEX IF NOT EXISTS idx_product_daily_stats_business ON product_daily_stats(business_id, day);

CREATE TABLE IF NOT EXISTS storefront_daily_stats (
  business_id TEXT NOT NULL,
  day TEXT NOT NULL,
  storefront_views INTEGER NOT NULL DEFAULT 0,
  product_views INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  link_taps INTEGER NOT NULL DEFAULT 0,
  partner_clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (business_id, day)
);

CREATE TABLE IF NOT EXISTS biz_source_daily_stats (
  business_id TEXT NOT NULL,
  day TEXT NOT NULL,
  source TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (business_id, day, source)
);

-- Buyer saves ("heart").
CREATE TABLE IF NOT EXISTS product_saves (
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, product_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_product_saves_product ON product_saves(product_id);
CREATE INDEX IF NOT EXISTS idx_product_saves_user_created ON product_saves(user_id, created_at DESC);

-- Partner tracked links: https://letsgrow.lu/p/<code>
CREATE TABLE IF NOT EXISTS partner_links (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  instructor_id TEXT NOT NULL,
  partnership_id TEXT,
  product_id TEXT,
  code TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  saves_attributed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (business_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_links_code ON partner_links(code);
CREATE INDEX IF NOT EXISTS idx_partner_links_business ON partner_links(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_links_instructor ON partner_links(instructor_id, created_at DESC);

-- Signed-in clicks, kept for save attribution (7-day window); pruned with raw events.
CREATE TABLE IF NOT EXISTS partner_link_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_partner_link_clicks_user ON partner_link_clicks(user_id, business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_link_clicks_created ON partner_link_clicks(created_at);

-- One attributed save per link + user + product, ever (save → unsave → save counts once).
CREATE TABLE IF NOT EXISTS partner_save_attributions (
  link_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (link_id, user_id, product_id)
);
