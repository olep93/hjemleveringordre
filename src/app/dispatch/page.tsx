import { redirect } from "next/navigation";
import { ensureBootstrapData, getSessionUser } from "@/lib/auth";
import Dashboard from "@/components/dashboard-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  await ensureBootstrapData();
  const user = await getSessionUser();
  if (!user) redirect("/api/auth/guest?next=/dispatch");

  return (
    <Dashboard
      user={{ displayName: user.displayName, role: user.role }}
      view="dispatch"
    />
  );
}
