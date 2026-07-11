"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, LockKeyhole } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(event.currentTarget);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password")
      })
    });

    const result = await response.json();

    if (!response.ok) {
      setError(result.error || "Innlogging feilet.");
      setLoading(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <Link className="back-link" href="/">
          <ArrowLeft size={18} /> Tilbake til dashboard
        </Link>

        <div className="login-logo">OBS</div>
        <LockKeyhole size={30} />

        <div>
          <p className="eyebrow">ADMINISTRASJON OG REDIGERING</p>
          <h1>Logg inn</h1>
        </div>

        <label>
          Brukernavn
          <input name="username" autoComplete="username" required />
        </label>

        <label>
          Passord
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>

        {error && <div className="error-box">{error}</div>}

        <button className="primary-button large" disabled={loading}>
          {loading ? "Logger inn …" : "Logg inn"}
        </button>
      </form>
    </main>
  );
}
