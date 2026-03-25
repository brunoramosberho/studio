import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";

export async function POST(request: NextRequest) {
  const { session, tenant } = await requireAuth();

  const { endpoint, p256dh, auth: authKey } = await request.json();

  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: session.user.id,
      endpoint,
      p256dh,
      auth: authKey,
      tenantId: tenant.id,
    },
    update: {
      userId: session.user.id,
      p256dh,
      auth: authKey,
      tenantId: tenant.id,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { session, tenant } = await requireAuth();

  const { endpoint } = await request.json();

  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  await prisma.pushSubscription.deleteMany({
    where: { endpoint, userId: session.user.id, tenantId: tenant.id },
  });

  return NextResponse.json({ ok: true });
}
