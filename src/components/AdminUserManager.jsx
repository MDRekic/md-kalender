import React, { useEffect, useState } from "react";
import {
  adminListUsers,
  adminCreateUser,
  adminUpdateUser,
  adminDeleteUser,
} from "../lib/api";

export default function AdminUserManager() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);

  // form za kreiranje
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user"); // "user" ili "admin"
  const [email, setEmail] = useState("");

  // koji red uređujemo
  const [editingId, setEditingId] = useState(null);
  const [editRole, setEditRole] = useState("user");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");

  async function load() {
    setLoading(true);
    try {
      const rows = await adminListUsers();
      setUsers(rows);
    } catch (e) {
      console.error(e);
      alert("Fehler beim Laden der Benutzerliste.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createUser(e) {
    e.preventDefault();
    if (!username || !password) {
      alert("Username und Passwort sind Pflichtfelder.");
      return;
    }
    try {
      await adminCreateUser({ username, password, role, email });
      setUsername("");
      setPassword("");
      setEmail("");
      setRole("user");
      await load();
      alert("Benutzer angelegt.");
    } catch (e) {
      console.error(e);
      alert("Anlegen fehlgeschlagen (Benutzername evtl. schon vorhanden?).");
    }
  }

  function startEdit(u) {
    setEditingId(u.id);
    setEditRole(u.role || "user");
    setEditEmail(u.email || "");
    setEditPassword("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditPassword("");
  }

  async function saveEdit(id) {
    const patch = {};
    if (editPassword.trim()) patch.password = editPassword.trim();
    if (editRole) patch.role = editRole;
    patch.email = editEmail || null;

    try {
      await adminUpdateUser(id, patch);
      await load();
      cancelEdit();
      alert("Gespeichert.");
    } catch (e) {
      console.error(e);
      alert("Speichern fehlgeschlagen.");
    }
  }

  async function removeUser(id) {
    if (!window.confirm("Diesen Benutzer wirklich löschen?")) return;
    try {
      await adminDeleteUser(id);
      await load();
    } catch (e) {
      console.error(e);
      alert("Löschen fehlgeschlagen.");
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Benutzerverwaltung</h2>

      {/* Dodaj korisnika */}
      <form onSubmit={createUser} className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-5">
        <div>
          <label className="block text-xs text-slate-600">Username *</label>
          <input
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="operater"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600">Passwort *</label>
          <input
            type="password"
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600">Rolle</label>
          <select
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="user">User (Operater)</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-600">E-Mail</label>
          <input
            type="email"
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@firma.de"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700"
          >
            Benutzer anlegen
          </button>
        </div>
      </form>

      {/* Lista korisnika */}
      {loading ? (
        <p className="text-slate-500">Lade Benutzer…</p>
      ) : users.length === 0 ? (
        <p className="text-slate-500">Keine Benutzer vorhanden.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="px-2 py-1">ID</th>
                <th className="px-2 py-1">Username</th>
                <th className="px-2 py-1">Rolle</th>
                <th className="px-2 py-1">E-Mail</th>
                <th className="px-2 py-1 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const editing = editingId === u.id;
                return (
                  <tr key={u.id} className="border-t">
                    <td className="px-2 py-2">{u.id}</td>
                    <td className="px-2 py-2">{u.username}</td>
                    <td className="px-2 py-2">
                      {editing ? (
                        <select
                          className="rounded-lg border border-slate-300 px-2 py-1"
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                          {u.role}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {editing ? (
                        <input
                          type="email"
                          className="w-full rounded-lg border border-slate-300 px-2 py-1"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          placeholder="user@firma.de"
                        />
                      ) : (
                        u.email || "—"
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {editing ? (
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="password"
                            className="w-40 rounded-lg border border-slate-300 px-2 py-1"
                            placeholder="Neues Passwort (optional)"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                          />
                          <button
                            onClick={() => saveEdit(u.id)}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700"
                          >
                            Speichern
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50"
                          >
                            Abbrechen
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => startEdit(u)}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50"
                          >
                            Bearbeiten
                          </button>
                          <button
                            onClick={() => removeUser(u.id)}
                            className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50"
                          >
                            Löschen
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
