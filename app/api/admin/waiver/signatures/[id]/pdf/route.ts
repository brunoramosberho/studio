import { NextResponse } from "next/server";
import { requireRole } from "@/lib/tenant";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireRole("ADMIN");
  const { id } = await params;

  const signature = await prisma.waiverSignature.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    select: { pdfStorageKey: true, participantName: true },
  });

  if (!signature?.pdfStorageKey) {
    return NextResponse.json(
      { error: "PDF not available yet" },
      { status: 404 },
    );
  }

  return NextResponse.redirect(signature.pdfStorageKey);
}
