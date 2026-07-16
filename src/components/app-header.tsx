"use client";

import Link from "next/link";
import {
  Archive,
  Bell,
  CheckSquare,
  ClipboardList,
  History,
  LayoutDashboard,
  LogIn,
  LogOut,
  Settings,
  Truck,
  UserCircle2
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

const navigation = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/orders", label: "Ordre", icon: ClipboardList },
  { href: "/dispatch", label: "Til utkjøring", icon: Truck },
  { href: "/completed", label: "Ferdige ordre", icon: CheckSquare },
  { href: "/history", label: "Historikk", icon: History }
];

export function AppHeader({
  user,
  children
}: {
  user: { displayName: string; role: string };
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isGuest = user.role === "GUEST";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  return (
    <header className="modern-topbar">
      <div className="topbar-inner">
        <Link className="obs-bygg-wordmark" href="/" aria-label="Obs BYGG">
          <span>OBS</span>
          <span>BYGG</span>
        </Link>

        <nav className="main-nav" aria-label="Hovedmeny">
          {navigation.map((item) => {
            const active = item.exact
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                className={active ? "nav-link active" : "nav-link"}
                href={item.href}
                key={item.href}
              >
                <Icon size={19} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="modern-header-actions">
          {children}
          <span className="header-icon-button" aria-label="Varsler">
            <Bell size={19} />
          </span>

          {isGuest ? (
            <Link className="header-login-button" href="/login">
              <LogIn size={18} />
              <span>Logg inn</span>
            </Link>
          ) : (
            <>
              {user.role === "ADMIN" && (
                <Link
                  className="header-icon-button"
                  href="/admin"
                  aria-label="Administrasjon"
                  title="Administrasjon"
                >
                  <Settings size={19} />
                </Link>
              )}

              <div className="header-user">
                <UserCircle2 size={36} />
                <div>
                  <strong>{user.displayName}</strong>
                  <span>{user.role === "ADMIN" ? "Administrator" : user.role}</span>
                </div>
              </div>

              <button
                className="header-icon-button"
                onClick={logout}
                aria-label="Logg ut"
                title="Logg ut"
              >
                <LogOut size={19} />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
