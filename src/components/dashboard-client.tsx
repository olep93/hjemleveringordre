"use client";

import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Box,
  ChevronRight,
  Clock3,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Copy,
  Check
} from "lucide-react";

type OrderStatus =
  | "TO_PICK"
  | "PICKING"
  | "READY_FOR_LOADING"
  | "LOADED"
  | "DELIVERED"
  | "ARCHIVED"
  | "DEVIATION";

type Order = {
  id: string;
  internalId?: string | null;
  title: string;
  orderNumber?: string | null;
  customerName?: string | null;
  phone?: string | null;
  deliveryDate?: string | null;
  status: OrderStatus;
  placement?: string | null;
  pickedBy?: string | null;
  photoCount: number;
  itemCount: number;
  checkedItemCount: number;
  importError?: string | null;
  createdAt?: string | null;
};

const statusLabel: Record<OrderStatus, string> = {
  TO_PICK: "Må plukkes",
  PICKING: "Under plukking",
  READY_FOR_LOADING: "Ferdig plukket",
  LOADED: "Lastet på bil",
  DELIVERED: "Levert",
  ARCHIVED: "Arkivert",
  DEVIATION: "Må kontrolleres"
};

export type DashboardView = "dashboard" | "orders" | "dispatch" | "completed" | "history";

export default function Dashboard({
  user,
  view = "dashboard"
}: {
  user: { displayName: string; role: string };
  view?: DashboardView;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch("/api/orders", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Kunne ikke hente ordre.");
      setOrders(result.orders ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente ordre.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();

    const params = new URLSearchParams(window.location.search);
    if (params.get("deleted") === "1") {
      setNotice("Ordren er slettet.");
      window.history.replaceState({}, "", "/");
      window.setTimeout(() => setNotice(null), 4500);
    }

    const timer = window.setInterval(() => void loadOrders(), 10000);
    return () => window.clearInterval(timer);
  }, [loadOrders]);

  async function copyInboundEmail() {
    const email = "ordre@hjemlevering.jobbverktoy.no";

    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      const input = document.createElement("textarea");
      input.value = email;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    }
  }

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return orders;
    return orders.filter((order) =>
      [order.title, order.orderNumber, order.customerName, order.phone, order.internalId]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }, [orders, query]);

  const toPick = filtered.filter((order) =>
    ["TO_PICK", "PICKING", "DEVIATION"].includes(order.status)
  );
  const ready = filtered.filter((order) =>
    ["READY_FOR_LOADING", "LOADED"].includes(order.status)
  );
  const completed = filtered.filter((order) => order.status === "DELIVERED");
  const history = filtered.filter((order) =>
    ["DELIVERED", "ARCHIVED"].includes(order.status)
  );

  const pageTitle = {
    dashboard: "Dashboard",
    orders: "Ordre",
    dispatch: "Til utkjøring",
    completed: "Ferdige ordre",
    history: "Historikk"
  }[view];

  return (
    <main>
      <AppHeader user={user}>
        <button className="icon-button" onClick={() => void loadOrders()} aria-label="Oppdater">
          <RefreshCw size={19} className={loading ? "spin" : ""} />
        </button>
        {user.role !== "GUEST" && (
          <Link className="primary-button" href="/orders/new">
            <Plus size={18} /> Legg til ordre
          </Link>
        )}
      </AppHeader>

      <section className="content">
        <div className="view-heading">
          <div>
            <p className="eyebrow">HJEMLEVERINGORDRE</p>
            <h1>{pageTitle}</h1>
          </div>
        </div>
        {notice && <div className="success-toast">{notice}</div>}

        <div className="email-info-bar">
          <div>
            <span className="email-info-label">Send kundeordre til</span>
            <strong>ordre@hjemlevering.jobbverktoy.no</strong>
            <p>PDF-en blir automatisk registrert som en ny hjemlevering.</p>
          </div>

          <button
            className="copy-email-button"
            type="button"
            onClick={() => void copyInboundEmail()}
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
            {copied ? "Kopiert" : "Kopier adresse"}
          </button>
        </div>

        <div className="summary-grid">
          <SummaryCard icon={<Box />} label="Må plukkes" value={orders.filter(o => o.status === "TO_PICK").length} />
          <SummaryCard icon={<Clock3 />} label="Under plukking" value={orders.filter(o => o.status === "PICKING").length} />
          <SummaryCard icon={<PackageCheck />} label="Klar for lasting" value={orders.filter(o => o.status === "READY_FOR_LOADING").length} />
          <SummaryCard icon={<AlertTriangle />} label="Kontrolleres" value={orders.filter(o => o.status === "DEVIATION").length} />
        </div>

        <div className="toolbar">
          <div className="search">
            <Search size={19} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Søk på ordre, navn eller telefon"
            />
          </div>
        </div>

        {error && <div className="error-box">{error}</div>}

        {(view === "dashboard" || view === "orders") && (
          <OrderSection
            title="Må plukkes denne uken"
            subtitle="Nye ordre, ordre under plukking og ordre som må kontrolleres"
            orders={toPick}
          />
        )}

        {(view === "dashboard" || view === "dispatch") && (
          <OrderSection
            title="Til utkjøring denne uken"
            subtitle="Ferdig plukkede ordre og ordre som er lastet på bil"
            orders={ready}
            emptyText="Ingen ordre er klare for utkjøring ennå."
          />
        )}

        {view === "completed" && (
          <OrderSection
            title="Ferdige ordre"
            subtitle="Ordre som er markert levert"
            orders={completed}
            emptyText="Ingen leverte ordre ennå."
          />
        )}

        {view === "history" && (
          <OrderSection
            title="Historikk"
            subtitle="Leveranser og arkiverte ordre"
            orders={history}
            emptyText="Historikken er tom."
          />
        )}
      </section>
    </main>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="summary-card">
      <div className="summary-icon">{icon}</div>
      <div><span>{label}</span><strong>{value}</strong></div>
    </div>
  );
}

function OrderSection({
  title,
  subtitle,
  orders,
  emptyText = "Ingen ordre funnet."
}: {
  title: string;
  subtitle: string;
  orders: Order[];
  emptyText?: string;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div><p className="eyebrow">{subtitle}</p><h2>{title}</h2></div>
        <span className="badge">{orders.length}</span>
      </div>
      <div className="order-list">
        {orders.length === 0 ? (
          <div className="empty-state">{emptyText}</div>
        ) : orders.map((order) => (
          <Link className="order-card" href={`/orders/${order.id}`} key={order.id}>
            <div className="order-main">
              <div className="order-number">{order.orderNumber ? `#${order.orderNumber}` : "!"}</div>
              <div>
                <h3>
                  {order.orderNumber
                    ? `Kundeordre ${order.orderNumber}${order.customerName ? ` – ${order.customerName}` : ""}`
                    : order.customerName
                      ? `Hjemlevering – ${order.customerName}`
                      : "Ny ordre – må kontrolleres"}
                </h3>
                <p>{order.customerName ? `Kunde: ${order.customerName}` : order.phone ? `Telefon: ${order.phone}` : "Må kontrolleres"}</p>
              </div>
            </div>
            <div className="order-info">
              <div><span>Status</span><strong>{statusLabel[order.status]}</strong></div>
              <div><span>Levering</span><strong>{order.deliveryDate ?? "Ikke satt"}</strong></div>
              <div><span>Plukket</span><strong>{order.checkedItemCount}/{order.itemCount}</strong></div>
              <div><span>Plassering</span><strong>{order.placement ?? "Ikke valgt"}</strong></div>
            </div>
            <ChevronRight className="chevron" />
          </Link>
        ))}
      </div>
    </section>
  );
}
