"use client";

import Link from "next/link";
import { LogIn, LogOut, Settings } from "lucide-react";
import { useRouter } from "next/navigation";

export function AppHeader({
  user,
  children
}: {
  user: { displayName: string; role: string };
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const isGuest = user.role === "GUEST";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">OBS</div>
        <div>
          <p className="eyebrow">BYGG TØNSBERG</p>
          <h1>Hjemleveringordre</h1>
        </div>
      </div>

      <div className="header-actions">
        {children}

        {isGuest ? (
          <Link className="login-link-button" href="/login">
            <LogIn size={18} />
            <span>Logg inn</span>
          </Link>
        ) : (
          <>
            {user.role === "ADMIN" && (
              <Link
                className="icon-button"
                href="/admin"
                aria-label="Administrasjon"
                title="Administrasjon"
              >
                <Settings size={19} />
              </Link>
            )}

            <span className="user-badge">{user.displayName}</span>

            <button
              className="icon-button"
              onClick={logout}
              aria-label="Logg ut"
              title="Logg ut"
            >
              <LogOut size={19} />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
