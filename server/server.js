import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const app = express();
const PORT = process.env.PORT || 5174;
const DB_PATH = path.join(process.cwd(), "data", "mydienst.sqlite");

const CORS_ORIGIN = process.env.CORS_ORIGIN || "https://termin.mydienst.de";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH || "";
const JWT_SECRET = process.env.JWT_SECRET || "changeme";

// --- Middlewares ---
app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// --- SQLite baza ---
let db;
(async () => {
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time TEXT NOT NULL
    );
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT,
      slot_id INTEGER,
      FOREIGN KEY(slot_id) REFERENCES slots(id)
    );
  `);
  console.log("SQLite DB ready at:", DB_PATH);
})();

// --- AUTH (Login / Logout / Me) ---
function setSessionCookie(res) {
  res.cookie("md_sess", "ok", {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 1000 * 60 * 60 * 12, // 12h
    path: "/",
  });
}

function clearSessionCookie(res) {
  res.clearCookie("md_sess", { path: "/" });
}

function isAuthed(req) {
  return req.cookies && req.cookies.md_sess === "ok";
}

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (username !== ADMIN_USER)
      return res.status(401).json({ error: "Bad username or password" });
    const ok = await bcrypt.compare(password, ADMIN_PASS_HASH);
    if (!ok) return res.status(401).json({ error: "Bad username or password" });

    setSessionCookie(res);
    return res.json({ ok: true, user: ADMIN_USER });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  if (isAuthed(req)) return res.json({ user: ADMIN_USER });
  return res.status(404).json({ error: "not_logged_in" });
});

// --- Slots API ---
app.get("/api/slots", async (req, res) => {
  const rows = await db.all("SELECT * FROM slots");
  res.json(rows);
});

// --- Test ruta ---
app.get("/api", (req, res) => res.send("API online ✅"));

// --- Start server ---
app.listen(PORT, "0.0.0.0", () => {
  console.log(`API running on http://localhost:${PORT}`);
});
