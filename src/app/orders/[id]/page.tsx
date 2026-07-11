import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import OrderPage from "@/components/order-detail-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <OrderPage />;
}
