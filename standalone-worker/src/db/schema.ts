// SQL schema for SQLite database

export const SCHEMA = `
-- Monitors table
CREATE TABLE IF NOT EXISTS monitors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  method TEXT NOT NULL CHECK(method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')),
  headers TEXT, -- JSON string
  body TEXT,
  timeout_seconds INTEGER NOT NULL DEFAULT 30,
  expected_status_code INTEGER,
  expected_body_contains TEXT,
  check_interval_seconds INTEGER NOT NULL DEFAULT 300,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Check results table
CREATE TABLE IF NOT EXISTS check_results (
  id TEXT PRIMARY KEY,
  monitor_id TEXT NOT NULL,
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  status_code INTEGER,
  response_time_ms INTEGER,
  success INTEGER NOT NULL,
  error_message TEXT,
  response_body_sample TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_monitors_is_active ON monitors(is_active);
CREATE INDEX IF NOT EXISTS idx_check_results_monitor_id ON check_results(monitor_id);
CREATE INDEX IF NOT EXISTS idx_check_results_checked_at ON check_results(checked_at);
CREATE INDEX IF NOT EXISTS idx_check_results_created_at ON check_results(created_at);
CREATE INDEX IF NOT EXISTS idx_check_results_success ON check_results(success);

-- Trigger to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_monitors_updated_at
AFTER UPDATE ON monitors
FOR EACH ROW
BEGIN
  UPDATE monitors SET updated_at = datetime('now') WHERE id = NEW.id;
END;
`;

export function initializeDatabase(db: any): void {
  db.execute(SCHEMA);
}
