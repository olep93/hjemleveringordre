import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import {
  sendOrderNotification,
  type NotificationEvent
} from "@/lib/notifications";

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(["ADMIN"]);
    const body = (await request.json()) as { event?: NotificationEvent };
    const event = body.event ?? "READY_FOR_LOADING";

    const result = await sendOrderNotification({
      event,
      subject: `Testvarsel fra Hjemleveringordre – ${event}`,
      html: `
        <h2>Varslingsfunksjonen virker</h2>
        <p>Dette testvarselet ble sendt av <strong>${user.displayName}</strong>.</p>
        <p>Varslingstype: <strong>${event}</strong></p>
      `
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke sende test." },
      { status: 400 }
    );
  }
}
