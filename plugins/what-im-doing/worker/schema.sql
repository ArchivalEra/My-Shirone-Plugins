-- What-Im-Doing Fleet Database Schema (Cloudflare D1)
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'desktop',
  status INTEGER NOT NULL DEFAULT 4,
  app_name TEXT NOT NULL DEFAULT '',
  window_title TEXT NOT NULL DEFAULT '',
  idle_seconds INTEGER NOT NULL DEFAULT 0,
  token TEXT NOT NULL,
  last_seen INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);
