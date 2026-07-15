import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import NewOrderPage from "@/components/new-order-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "GUEST") redirect("/");
  return <NewOrderPage />;
}
