import { redirect } from "next/navigation";
import { ensureBootstrapData, getSessionUser } from "@/lib/auth";
import Dashboard from "@/components/dashboard-client";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureBootstrapData();

  const user = await getSessionUser();

  if (!user) {
    redirect("/api/auth/guest?next=/");
  }

  return (
    <Dashboard
      user={{
        displayName: user.displayName,
        role: user.role
      }}
    />
  );
}
