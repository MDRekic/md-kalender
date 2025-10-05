PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,      -- YYYY-MM-DD
  time TEXT NOT NULL,      -- HH:MM
  duration INTEGER NOT NULL DEFAULT 120,
  status TEXT NOT NULL DEFAULT 'free'  -- free | booked
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_id INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (slot_id) REFERENCES slots(id)
);
