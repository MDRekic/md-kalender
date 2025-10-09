PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  duration INTEGER NOT NULL DEFAULT 120,
  status TEXT NOT NULL DEFAULT 'free'
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_id INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  plz TEXT,
  city TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (slot_id) REFERENCES slots(id)
);

-- Users (admin nalozi)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  email TEXT
);

CREATE TABLE IF NOT EXISTS canceled_bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER,               -- originalni ID rezervacije
  slot_date TEXT,
  slot_time TEXT,
  slot_duration INTEGER,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  plz TEXT,
  city TEXT,
  note TEXT,
  reason TEXT,                      -- razlog storna
  canceled_by TEXT,                 -- username operatera/admina
  canceled_by_id INTEGER,           -- korisnički id
  canceled_at TEXT NOT NULL DEFAULT (datetime('now'))
);