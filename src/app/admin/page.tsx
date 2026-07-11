"use client";

import Link from "next/link";
import { ArrowLeft, Bell, UserPlus, Users, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

type User = {
  id: string;
  username: string;
  displayName: string;
  role: "EMPLOYEE" | "MANAGER" | "ADMIN";
  active: boolean;
};

type Recipient = {
  id: string;
  email: string;
  active: boolean;
};

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [usersResponse, notificationsResponse] = await Promise.all([
      fetch("/api/admin/users", { cache: "no-store" }),
      fetch("/api/admin/notifications", { cache: "no-store" })
    ]);

    if (usersResponse.status === 401 || usersResponse.status === 403) {
      window.location.href = "/";
      return;
    }

    const usersResult = await usersResponse.json();
    const notificationsResult = await notificationsResponse.json();

    setUsers(usersResult.users || []);
    setRecipients(notificationsResult.recipients || []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const form = new FormData(event.currentTarget);

    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.get("username"),
        displayName: form.get("displayName"),
        password: form.get("password"),
        role: form.get("role")
      })
    });

    const result = await response.json();
    setMessage(response.ok ? "Bruker opprettet." : result.error);
    if (response.ok) {
      event.currentTarget.reset();
      await load();
    }
  }

  async function toggleUser(user: User) {
    await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !user.active })
    });
    await load();
  }

  async function addRecipient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.get("email") })
    });

    const result = await response.json();
    setMessage(response.ok ? "E-post lagt til." : result.error);
    if (response.ok) {
      event.currentTarget.reset();
      await load();
    }
  }

  async function removeRecipient(id: string) {
    await fetch(`/api/admin/notifications/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <main className="page-shell">
      <div className="page-header">
        <Link className="back-link" href="/">
          <ArrowLeft size={19} /> Dashboard
        </Link>
        <div>
          <p className="eyebrow">ADMINISTRASJON</p>
          <h1>Kontrollpanel</h1>
        </div>
      </div>

      {message && <div className="info-message">{message}</div>}

      <div className="admin-grid">
        <section className="form-card">
          <h2><UserPlus size={22} /> Opprett bruker</h2>
          <form className="form-grid" onSubmit={addUser}>
            <label>
              Brukernavn
              <input name="username" required />
            </label>
            <label>
              Visningsnavn
              <input name="displayName" required />
            </label>
            <label>
              Midlertidig passord
              <input name="password" type="password" minLength={8} required />
            </label>
            <label>
              Rolle
              <select name="role" defaultValue="EMPLOYEE">
                <option value="EMPLOYEE">Medarbeider</option>
                <option value="MANAGER">Leder</option>
                <option value="ADMIN">Administrator</option>
              </select>
            </label>
            <button className="primary-button full">Opprett bruker</button>
          </form>
        </section>

        <section className="form-card">
          <h2><Users size={22} /> Brukere</h2>
          <div className="admin-list">
            {users.map((user) => (
              <div className="admin-list-row" key={user.id}>
                <div>
                  <strong>{user.displayName}</strong>
                  <p>{user.username} · {user.role}</p>
                </div>
                <button
                  className={user.active ? "secondary-button" : "success-button"}
                  onClick={() => void toggleUser(user)}
                >
                  {user.active ? "Deaktiver" : "Aktiver"}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="form-card full-width">
          <h2><Bell size={22} /> Varslingsliste</h2>
          <form className="inline-form" onSubmit={addRecipient}>
            <input
              name="email"
              type="email"
              placeholder="navn@firma.no"
              required
            />
            <button className="primary-button">Legg til e-post</button>
          </form>
          <div className="recipient-list">
            {recipients.map((recipient) => (
              <div className="recipient-chip" key={recipient.id}>
                {recipient.email}
                <button
                  aria-label={`Fjern ${recipient.email}`}
                  onClick={() => void removeRecipient(recipient.id)}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
