-- Aureum D1 schema — Phase 1 (gold)
-- Apply locally:  npm run db:migrate:local
-- Apply remote:   npm run db:migrate:remote

CREATE TABLE IF NOT EXISTS price_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol      TEXT    NOT NULL,          -- e.g. 'XAU_USD'
  timeframe   TEXT    NOT NULL,          -- 'M15' | 'H1' | 'H4' | 'D1' | 'W1'
  ts          INTEGER NOT NULL,          -- unix seconds, candle open time
  open        REAL    NOT NULL,
  high        REAL    NOT NULL,
  low         REAL    NOT NULL,
  close       REAL    NOT NULL,
  volume      REAL,
  UNIQUE (symbol, timeframe, ts)
);

CREATE INDEX IF NOT EXISTS idx_price_history_lookup
  ON price_history (symbol, timeframe, ts DESC);

CREATE TABLE IF NOT EXISTS news (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source        TEXT    NOT NULL,        -- 'reuters' | 'kitco' | ...
  title         TEXT    NOT NULL,
  summary       TEXT,
  url           TEXT    NOT NULL UNIQUE,
  published_at  INTEGER NOT NULL,        -- unix seconds
  asset_tag     TEXT,                    -- 'gold' | 'set' | symbol
  sentiment     TEXT,                    -- 'positive' | 'negative' | 'neutral'
  impact        TEXT                     -- 'high' | 'medium' | 'low'
);

CREATE INDEX IF NOT EXISTS idx_news_published ON news (published_at DESC);

-- Admin AI Chat (Claude) — usage log for the cost dashboard in /admin/chat.
CREATE TABLE IF NOT EXISTS chat_usage (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts                        INTEGER NOT NULL,   -- unix seconds
  model                     TEXT    NOT NULL,
  input_tokens              INTEGER NOT NULL,
  output_tokens             INTEGER NOT NULL,
  cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_input_tokens   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_chat_usage_ts ON chat_usage (ts DESC);

-- Admin AI Chat — persisted conversation (single ongoing thread, admin-only
-- single user so no session/thread id needed yet).
CREATE TABLE IF NOT EXISTS chat_messages (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      INTEGER NOT NULL,   -- unix seconds
  role    TEXT    NOT NULL,   -- 'user' | 'assistant'
  content TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_ts ON chat_messages (ts);
