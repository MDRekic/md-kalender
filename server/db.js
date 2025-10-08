import sqlite3 from 'sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url)); // ✅ radi i na Windowsu
const dbPath = join(__dirname, 'mydienst.sqlite');

sqlite3.verbose();
export const db = new sqlite3.Database(dbPath);

export function migrate() {
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf8');
  db.exec(schema, (err) => {
    if (err) console.error('Migration failed:', err.message);
    else console.log('Database migrated successfully.');
  });
}

export const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });

export const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

export const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
export async function migrate() {
  // ... ako imaš schema.sql, pokreni ga
  // ...

  // Osiguraj kolone u bookings
  const cols = await db.all(`PRAGMA table_info(bookings)`);
  const names = cols.map(c => c.name);
  if (!names.includes('plz'))  await db.exec(`ALTER TABLE bookings ADD COLUMN plz TEXT;`);
  if (!names.includes('city')) await db.exec(`ALTER TABLE bookings ADD COLUMN city TEXT;`);
}