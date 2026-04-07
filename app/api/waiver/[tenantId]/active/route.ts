import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;

  const waiver = await prisma.waiver.findFirst({
    where: { tenantId, status: "active" },
    select: {
      id: true,
      version: true,
      title: true,
      content: true,
      isPdf: true,
      pdfStorageKey: true,
      requirePhone: true,
      requireBirthDate: true,
      requireScrollRead: true,
    },
  });

  if (!waiver) {
    return NextResponse.json({ waiver: null });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  const content = waiver.content.replace(
    /\{\{nombre_estudio\}\}/g,
    tenant?.name ?? "",
  );

  return NextResponse.json({
    waiver: { ...waiver, content },
  });
}
