import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/tenant";
import { prisma } from "@/lib/db";

export async function GET() {
  const ctx = await requireRole("ADMIN");

  const waiver = await prisma.waiver.findFirst({
    where: { tenantId: ctx.tenant.id },
    orderBy: { version: "desc" },
    include: {
      _count: { select: { signatures: true } },
    },
  });

  return NextResponse.json({ waiver });
}

export async function POST(req: NextRequest) {
  const ctx = await requireRole("ADMIN");

  const body = await req.json();
  const { title, content } = body as { title?: string; content?: string };

  const existing = await prisma.waiver.findFirst({
    where: { tenantId: ctx.tenant.id, status: "draft" },
  });

  if (existing) {
    return NextResponse.json(
      { error: "Ya existe un borrador. Edítalo en vez de crear uno nuevo." },
      { status: 409 },
    );
  }

  const latestVersion = await prisma.waiver.findFirst({
    where: { tenantId: ctx.tenant.id },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const waiver = await prisma.waiver.create({
    data: {
      tenantId: ctx.tenant.id,
      version: (latestVersion?.version ?? 0) + 1,
      title: title || "Acuerdo de responsabilidad",
      content: content || "",
      status: "draft",
    },
  });

  return NextResponse.json({ waiver }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireRole("ADMIN");
  const body = await req.json();

  const latest = await prisma.waiver.findFirst({
    where: { tenantId: ctx.tenant.id },
    orderBy: { version: "desc" },
  });

  if (!latest) {
    return NextResponse.json(
      { error: "No hay waiver creado" },
      { status: 404 },
    );
  }

  const {
    title,
    content,
    requirePhone,
    requireBirthDate,
    requireScrollRead,
    triggerOnBooking,
    triggerOnFirstOpen,
    triggerOnFirstBooking,
    triggerReminder24h,
    blockCheckinWithoutSignature,
  } = body;

  const waiver = await prisma.waiver.update({
    where: { id: latest.id },
    data: {
      ...(title !== undefined && { title }),
      ...(content !== undefined && { content }),
      ...(requirePhone !== undefined && { requirePhone }),
      ...(requireBirthDate !== undefined && { requireBirthDate }),
      ...(requireScrollRead !== undefined && { requireScrollRead }),
      ...(triggerOnBooking !== undefined && { triggerOnBooking }),
      ...(triggerOnFirstOpen !== undefined && { triggerOnFirstOpen }),
      ...(triggerOnFirstBooking !== undefined && { triggerOnFirstBooking }),
      ...(triggerReminder24h !== undefined && { triggerReminder24h }),
      ...(blockCheckinWithoutSignature !== undefined && {
        blockCheckinWithoutSignature,
      }),
    },
  });

  return NextResponse.json({ waiver });
}
