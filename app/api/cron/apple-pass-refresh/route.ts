import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isApplePassConfigured } from "@/lib/wallet/config";
import { sendPassPush } from "@/lib/wallet/apns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily sweep: push an update notification to every registered Apple Wallet
 * pass so Wallet re-fetches it. Event hooks (attendance, Stripe webhooks) cover
 * the common changes immediately; this catches the passive ones that emit no
 * event — a pack whose expiresAt simply passes, level renames, branding edits —
 * so no pass is ever more than a day stale. Prunes tokens APNs reports gone.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isApplePassConfigured()) {
    return NextResponse.json({ skipped: "wallet_not_configured" });
  }

  const regs = await prisma.applePassRegistration.findMany({
    select: { id: true, pushToken: true },
  });

  let pushed = 0;
  let pruned = 0;
  let failed = 0;
  for (const reg of regs) {
    const result = await sendPassPush(reg.pushToken);
    if (result === "ok") pushed++;
    else if (result === "gone") {
      await prisma.applePassRegistration.delete({ where: { id: reg.id } }).catch(() => {});
      pruned++;
    } else failed++;
  }

  return NextResponse.json({ registrations: regs.length, pushed, pruned, failed });
}
