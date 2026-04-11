import { NextRequest, NextResponse } from "next/server";
import { verifyWaiverToken } from "@/lib/waiver/token";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Token missing" }, { status: 400 });
  }

  const payload = await verifyWaiverToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Token inválido o expirado" }, { status: 401 });
  }

  const [user, waiver] = await Promise.all([
    prisma.user.findUnique({
      where: { id: payload.userId },
      select: { name: true },
    }),
    prisma.waiver.findFirst({
      where: { tenantId: payload.tenantId, status: "active" },
      select: {
        id: true,
        version: true,
        title: true,
        content: true,
        requirePhone: true,
        requireBirthDate: true,
        requireScrollRead: true,
      },
    }),
  ]);

  const tenant = await prisma.tenant.findUnique({
    where: { id: payload.tenantId },
    select: { name: true, logoUrl: true },
  });

  const content = waiver?.content.replace(
    /\{\{nombre_estudio\}\}/g,
    tenant?.name ?? "",
  );

  return NextResponse.json({
    userName: user?.name ?? "",
    studioName: tenant?.name ?? "",
    logoUrl: tenant?.logoUrl ?? null,
    waiver: waiver ? { ...waiver, content } : null,
  });
}
