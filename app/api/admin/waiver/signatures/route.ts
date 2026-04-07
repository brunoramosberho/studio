import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/tenant";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const ctx = await requireRole("ADMIN");
  const url = new URL(req.url);
  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status"); // signed | pending | needs_resign

  const activeWaiver = await prisma.waiver.findFirst({
    where: { tenantId: ctx.tenant.id, status: "active" },
    select: { id: true, version: true },
  });

  if (!activeWaiver) {
    return NextResponse.json({
      signatures: [],
      stats: { signed: 0, pending: 0, needsResign: 0, total: 0 },
    });
  }

  const totalMembers = await prisma.membership.count({
    where: { tenantId: ctx.tenant.id, role: "CLIENT" },
  });

  const allSignatures = await prisma.waiverSignature.findMany({
    where: { tenantId: ctx.tenant.id, waiverId: activeWaiver.id },
    include: {
      member: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { signedAt: "desc" },
  });

  const signed = allSignatures.filter(
    (s) => s.waiverVersion >= activeWaiver.version,
  );
  const needsResign = allSignatures.filter(
    (s) => s.waiverVersion < activeWaiver.version,
  );
  const signedMemberIds = new Set(allSignatures.map((s) => s.memberId));
  const pendingCount = totalMembers - signedMemberIds.size;

  let result = allSignatures.map((s) => ({
    id: s.id,
    member: s.member,
    signedAt: s.signedAt,
    waiverVersion: s.waiverVersion,
    pdfUrl: s.pdfStorageKey,
    status:
      s.waiverVersion >= activeWaiver.version
        ? ("signed" as const)
        : ("needs_resign" as const),
  }));

  if (search) {
    const q = search.toLowerCase();
    result = result.filter(
      (r) =>
        r.member.name?.toLowerCase().includes(q) ||
        r.member.email.toLowerCase().includes(q),
    );
  }

  if (status === "signed") {
    result = result.filter((r) => r.status === "signed");
  } else if (status === "needs_resign") {
    result = result.filter((r) => r.status === "needs_resign");
  }

  // For "pending" status, fetch members without signatures
  let pendingMembers: Array<{
    id: string;
    member: { id: string; name: string | null; email: string; image: string | null };
    signedAt: null;
    waiverVersion: null;
    pdfUrl: null;
    status: "pending";
  }> = [];

  if (!status || status === "pending") {
    const membersWithout = await prisma.membership.findMany({
      where: {
        tenantId: ctx.tenant.id,
        role: "CLIENT",
        userId: { notIn: Array.from(signedMemberIds) },
        ...(search
          ? {
              user: {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { email: { contains: search, mode: "insensitive" } },
                ],
              },
            }
          : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    pendingMembers = membersWithout.map((m) => ({
      id: m.userId,
      member: m.user,
      signedAt: null,
      waiverVersion: null,
      pdfUrl: null,
      status: "pending" as const,
    }));
  }

  const allResults =
    status === "pending"
      ? pendingMembers
      : status
        ? result
        : [...result, ...pendingMembers];

  return NextResponse.json({
    signatures: allResults,
    stats: {
      signed: signed.length,
      pending: pendingCount,
      needsResign: needsResign.length,
      total: totalMembers,
    },
  });
}
