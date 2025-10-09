// server/db.js  (ESM)
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';

sqlite3.verbose();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// >>> Jedna jedina baza koju backend koristi:
const DB_PATH = path.join(__dirname, 'mydienst.sqlite');
console.log('[DB] Using file:', DB_PATH);

const db = new sqlite3.Database(DB_PATH);

// Promise utili
export function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

export function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

export function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

// Kreiraj tabele ako ne postoje (uključujući canceled_bookings s created_at)
export async function migrate() {
  await run(`PRAGMA journal_mode = WAL`);

  // slots
  await run(`
    CREATE TABLE IF NOT EXISTS slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      duration INTEGER NOT NULL DEFAULT 120,
      status TEXT NOT NULL DEFAULT 'free'
    )
  `);

  // bookings
  await run(`
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
      completed_by TEXT,
      completed_at TEXT,
      FOREIGN KEY (slot_id) REFERENCES slots(id)
    )
  `);

  // users
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      email TEXT
    )
  `);

  // canceled_bookings (audit) – uključuje created_at
  await run(`
    CREATE TABLE IF NOT EXISTS canceled_bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      slot_date TEXT NOT NULL,
      slot_time TEXT NOT NULL,
      slot_duration INTEGER NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      plz TEXT,
      city TEXT,
      note TEXT,
      reason TEXT NOT NULL,
      canceled_by TEXT,
      canceled_by_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}
