"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  Check,
  KeyRound,
  Mail,
  Save,
  Send,
  Shield,
  TestTube2,
  ToggleLeft,
  ToggleRight,
  UserPlus,
  Users,
  X
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

type UserRole = "EMPLOYEE" | "MANAGER" | "ADMIN";
type NotificationEvent =
  | "NEW_ORDER"
  | "READY_FOR_LOADING"
  | "LOADED"
  | "DELIVERED";

type User = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  active: boolean;
};

type Recipient = {
  id: string;
  email: string;
  active: boolean;
  events: NotificationEvent[];
};

type EmailSettings = {
  waypointTestMode: boolean;
  waypointEmail: string;
};

const eventLabels: Record<NotificationEvent, string> = {
  NEW_ORDER: "Ny ordre",
  READY_FOR_LOADING: "Klar for lasting",
  LOADED: "Lastet på bil",
  DELIVERED: "Levert"
};

const allEvents = Object.keys(eventLabels) as NotificationEvent[];

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [emailSettings, setEmailSettings] = useState<EmailSettings>({
    waypointTestMode: true,
    waypointEmail: "marcus@waypointlarvik.no"
  });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [usersResponse, recipientsResponse, settingsResponse] =
      await Promise.all([
        fetch("/api/admin/users", { cache: "no-store" }),
        fetch("/api/admin/notifications", { cache: "no-store" }),
        fetch("/api/admin/settings", { cache: "no-store" })
      ]);

    if (usersResponse.status === 401 || usersResponse.status === 403) {
      window.location.href = "/";
      return;
    }

    const usersResult = await usersResponse.json();
    const recipientsResult = await recipientsResponse.json();
    const settingsResult = await settingsResponse.json();
    setUsers(usersResult.users ?? []);
    setRecipients(recipientsResult.recipients ?? []);
    setEmailSettings(
      settingsResult.settings ?? {
        waypointTestMode: true,
        waypointEmail: "marcus@waypointlarvik.no"
      }
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    try {
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
      setMessage(response.ok ? "Brukeren er opprettet." : result.error);
      if (response.ok) {
        formElement.reset();
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function updateUser(user: User, patch: Record<string, unknown>) {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const result = await response.json();
      setMessage(response.ok ? "Brukeren er oppdatert." : result.error);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(user: User) {
    const password = window.prompt(
      `Nytt midlertidig passord for ${user.displayName} (minst 8 tegn):`
    );
    if (!password) return;
    await updateUser(user, { password });
  }

  async function addRecipient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const events = allEvents.filter((item) => form.get(item) === "on");

    try {
      const response = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), events })
      });
      const result = await response.json();
      setMessage(response.ok ? "E-postadressen er lagt til." : result.error);
      if (response.ok) {
        formElement.reset();
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecipientEvent(
    recipient: Recipient,
    event: NotificationEvent
  ) {
    const events = recipient.events.includes(event)
      ? recipient.events.filter((item) => item !== event)
      : [...recipient.events, event];

    await fetch(`/api/admin/notifications/${recipient.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events })
    });
    await load();
  }

  async function removeRecipient(id: string) {
    if (!window.confirm("Vil du fjerne denne varslingsmottakeren?")) return;
    await fetch(`/api/admin/notifications/${id}`, { method: "DELETE" });
    await load();
  }

  async function sendTest(event: NotificationEvent) {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event })
      });
      const result = await response.json();
      setMessage(
        response.ok
          ? `Testvarsel sendt til ${result.sent ?? 0} mottaker(e).`
          : result.error
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateEmailSettings(patch: Partial<EmailSettings>) {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error ?? "Kunne ikke lagre e-postinnstillingen.");
        return;
      }

      setEmailSettings(result.settings);
      setMessage(
        result.settings.waypointTestMode
          ? "Testmodus er aktivert. Transportøren mottar ingen e-post."
          : "Testmodus er slått av. E-post sendes nå til transportøren med kopi til innlogget bruker."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <div className="admin-top">
        <Link className="modern-back-link" href="/">
          <ArrowLeft size={18} /> Tilbake til dashboard
        </Link>
        <div>
          <p className="eyebrow">ADMINISTRASJON</p>
          <h1>Brukere og varslinger</h1>
        </div>
      </div>

      <section className="modern-order-page admin-page-modern">
        {message && <div className="info-message">{message}</div>}

        <section className={`modern-card email-mode-card ${
          emailSettings.waypointTestMode ? "test-active" : "live-active"
        }`}>
          <div className="email-mode-heading">
            <span className="title-icon">
              <TestTube2 size={21} />
            </span>
            <div>
              <h2>Test mode</h2>
              <p>
                Når testmodus er på, sendes ferdigstillingsmailen kun til
                jobb-e-posten til den innloggede brukeren. Transportøren
                mottar ingenting. Når testmodus er av, sendes mailen til
                Waypoint med innlogget bruker i kopifeltet.
              </p>
            </div>
          </div>

          <div className="email-mode-controls">
            <label>
              Waypoint / transportør
              <input
                type="email"
                value={emailSettings.waypointEmail}
                disabled={busy}
                onChange={(event) =>
                  setEmailSettings((current) => ({
                    ...current,
                    waypointEmail: event.target.value
                  }))
                }
                onBlur={() =>
                  void updateEmailSettings({
                    waypointEmail: emailSettings.waypointEmail
                  })
                }
              />
            </label>

            <button
              type="button"
              className={
                emailSettings.waypointTestMode
                  ? "test-mode-toggle enabled"
                  : "test-mode-toggle disabled"
              }
              disabled={busy}
              onClick={() =>
                void updateEmailSettings({
                  waypointTestMode: !emailSettings.waypointTestMode
                })
              }
            >
              {emailSettings.waypointTestMode ? (
                <ToggleRight size={34} />
              ) : (
                <ToggleLeft size={34} />
              )}
              <span>
                <strong>
                  {emailSettings.waypointTestMode
                    ? "Testmodus er på"
                    : "Testmodus er av"}
                </strong>
                <small>
                  {emailSettings.waypointTestMode
                    ? "Kun innlogget bruker mottar mailen"
                    : "Transportøren mottar mailen"}
                </small>
              </span>
            </button>
          </div>
        </section>

        <div className="admin-modern-grid">
          <section className="modern-card">
            <div className="modern-card-title">
              <span className="title-icon"><UserPlus size={21} /></span>
              <h2>Opprett bruker</h2>
            </div>

            <form className="modern-form-grid" onSubmit={addUser}>
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
              <button className="blue-action full" disabled={busy}>
                <UserPlus size={18} /> Opprett bruker
              </button>
            </form>
          </section>

          <section className="modern-card">
            <div className="modern-card-title">
              <span className="title-icon"><Mail size={21} /></span>
              <h2>Ny varslingsmottaker</h2>
            </div>

            <form className="recipient-form-modern" onSubmit={addRecipient}>
              <label>
                E-postadresse
                <input name="email" type="email" placeholder="navn@firma.no" required />
              </label>
              <div className="notification-check-grid">
                {allEvents.map((event) => (
                  <label key={event}>
                    <input name={event} type="checkbox" defaultChecked />
                    {eventLabels[event]}
                  </label>
                ))}
              </div>
              <button className="blue-action" disabled={busy}>
                <Bell size={18} /> Legg til mottaker
              </button>
            </form>
          </section>
        </div>

        <section className="modern-card admin-section-spacing">
          <div className="modern-card-title">
            <span className="title-icon"><Users size={21} /></span>
            <h2>Brukere</h2>
          </div>

          <div className="admin-table">
            {users.map((user) => (
              <div className="admin-user-row" key={user.id}>
                <div>
                  <strong>{user.displayName}</strong>
                  <span>@{user.username}</span>
                </div>

                <select
                  value={user.role}
                  disabled={busy}
                  onChange={(event) =>
                    void updateUser(user, {
                      role: event.target.value as UserRole
                    })
                  }
                >
                  <option value="EMPLOYEE">Medarbeider</option>
                  <option value="MANAGER">Leder</option>
                  <option value="ADMIN">Administrator</option>
                </select>

                <button
                  className="outline-action compact"
                  disabled={busy}
                  onClick={() => void resetPassword(user)}
                >
                  <KeyRound size={16} /> Nytt passord
                </button>

                <button
                  className={user.active ? "modern-danger-button compact" : "green-action compact"}
                  disabled={busy}
                  onClick={() => void updateUser(user, { active: !user.active })}
                >
                  {user.active ? "Deaktiver" : "Aktiver"}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="modern-card admin-section-spacing">
          <div className="modern-card-title">
            <span className="title-icon"><Bell size={21} /></span>
            <h2>Varslingsmottakere</h2>
          </div>

          <div className="recipient-admin-list">
            {recipients.map((recipient) => (
              <div className="recipient-admin-row" key={recipient.id}>
                <div className="recipient-email">
                  <Mail size={18} />
                  <strong>{recipient.email}</strong>
                </div>

                <div className="notification-event-buttons">
                  {allEvents.map((event) => {
                    const selected = recipient.events.includes(event);
                    return (
                      <button
                        className={selected ? "event-toggle selected" : "event-toggle"}
                        key={event}
                        onClick={() => void toggleRecipientEvent(recipient, event)}
                      >
                        {selected && <Check size={14} />}
                        {eventLabels[event]}
                      </button>
                    );
                  })}
                </div>

                <button
                  className="header-icon-button recipient-remove"
                  aria-label={`Fjern ${recipient.email}`}
                  onClick={() => void removeRecipient(recipient.id)}
                >
                  <X size={17} />
                </button>
              </div>
            ))}
          </div>

          <div className="test-notification-row">
            <span>Test varslingsoppsettet:</span>
            {allEvents.map((event) => (
              <button
                className="outline-action compact"
                disabled={busy}
                key={event}
                onClick={() => void sendTest(event)}
              >
                <Send size={15} /> {eventLabels[event]}
              </button>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
