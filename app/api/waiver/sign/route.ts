import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { capitalizeName, composeName, splitName } from "@/lib/utils";
import { generateSignatureHash } from "@/lib/waiver/hash";
import { generateSignedPdf } from "@/lib/waiver/pdf";
import { uploadMedia } from "@/lib/supabase-storage";
import { verifyWaiverToken } from "@/lib/waiver/token";

async function resolveIdentity(req: NextRequest, body: Record<string, unknown>) {
  // Token-based auth (from email links)
  const token = body.token as string | undefined;
  if (token) {
    const payload = await verifyWaiverToken(token);
    if (payload) return { userId: payload.userId, tenantId: payload.tenantId };
  }

  // Session-based auth (from PWA)
  const ctx = await getAuthContext();
  if (ctx) return { userId: ctx.session.user.id, tenantId: ctx.tenant.id };

  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const identity = await resolveIdentity(req, body);

  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId, tenantId } = identity;

  const {
    waiverId,
    signatureData,
    method,
    participantName: rawName,
    participantFirstName,
    participantLastName,
    participantPhone,
    participantBirthDate,
  } = body as {
    waiverId: string;
    signatureData: string;
    method: "drawn" | "typed";
    participantName?: string;
    participantFirstName?: string;
    participantLastName?: string;
    participantPhone?: string;
    participantBirthDate?: string;
  };

  // Prefer structured first/last; fall back to splitting a single name (e.g. an
  // older client or a token email link that only carried a full name).
  const fallback = splitName(rawName);
  const firstName =
    capitalizeName((participantFirstName ?? fallback.firstName ?? "").trim()) ||
    null;
  const lastName =
    capitalizeName((participantLastName ?? fallback.lastName ?? "").trim()) ||
    null;
  const participantName = composeName(firstName, lastName);
  const phone = participantPhone?.trim() || null;
  const birthDate =
    typeof participantBirthDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(participantBirthDate)
      ? participantBirthDate
      : null;

  // Signing the waiver is the moment we require a complete profile: first name,
  // last name, phone and date of birth are all mandatory here.
  if (
    !waiverId ||
    !signatureData ||
    !firstName ||
    !lastName ||
    !participantName ||
    !phone ||
    !birthDate
  ) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  const waiver = await prisma.waiver.findFirst({
    where: { id: waiverId, tenantId, status: "active" },
  });

  if (!waiver) {
    return NextResponse.json(
      { error: "Waiver not found or inactive" },
      { status: 404 },
    );
  }

  const existing = await prisma.waiverSignature.findUnique({
    where: {
      waiverId_memberId: { waiverId, memberId: userId },
    },
  });

  if (existing && existing.waiverVersion >= waiver.version) {
    return NextResponse.json(
      { error: "Already signed this version" },
      { status: 409 },
    );
  }

  // The waiver is where we capture the authoritative profile data, so write the
  // collected fields back onto the user (the participant is always the signer).
  await prisma.user
    .update({
      where: { id: userId },
      data: {
        firstName,
        lastName,
        name: participantName,
        phone,
        birthday: new Date(`${birthDate}T00:00:00.000Z`),
      },
    })
    .catch((err) => {
      console.error("[waiver] profile update failed:", err);
    });

  const signatureHash = generateSignatureHash(signatureData);
  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const userAgent = req.headers.get("user-agent") || undefined;

  const signatureRecord = existing
    ? await prisma.waiverSignature.update({
        where: { id: existing.id },
        data: {
          waiverVersion: waiver.version,
          participantName,
          participantPhone: phone,
          participantBirthDate: new Date(birthDate),
          method,
          signatureData,
          signatureHash,
          ipAddress,
          userAgent,
          signedAt: new Date(),
          pdfStorageKey: null,
          emailSentAt: null,
        },
      })
    : await prisma.waiverSignature.create({
        data: {
          tenantId,
          waiverId,
          memberId: userId,
          waiverVersion: waiver.version,
          participantName,
          participantPhone: phone,
          participantBirthDate: new Date(birthDate),
          method,
          signatureData,
          signatureHash,
          ipAddress,
          userAgent,
        },
      });

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  // PDF generation runs async — don't block the response
  generatePdfInBackground(signatureRecord.id, waiver, tenant?.name ?? "", {
    memberName: participantName,
    phone,
    birthDate,
    signatureBase64: signatureData,
    signatureHash,
    ipAddress,
    signedAt: signatureRecord.signedAt,
  }).catch((err) => {
    console.error("[waiver] PDF generation failed:", err);
  });

  return NextResponse.json({ success: true, signatureId: signatureRecord.id });
}

async function generatePdfInBackground(
  signatureId: string,
  waiver: { id: string; title: string; content: string; version: number; tenantId: string },
  studioName: string,
  data: {
    memberName: string;
    phone?: string;
    birthDate?: string;
    signatureBase64: string;
    signatureHash: string;
    ipAddress: string;
    signedAt: Date;
  },
) {
  const pdfBytes = await generateSignedPdf({
    waiverTitle: waiver.title,
    waiverContent: waiver.content.replace(
      /\{\{nombre_estudio\}\}/g,
      studioName,
    ).replace(
      /\{\{nombre_cliente\}\}/g,
      data.memberName,
    ),
    studioName,
    memberName: data.memberName,
    phone: data.phone,
    birthDate: data.birthDate,
    signatureBase64: data.signatureBase64,
    signatureHash: data.signatureHash,
    ipAddress: data.ipAddress,
    signedAt: data.signedAt,
    waiverVersion: waiver.version,
  });

  const filename = `waivers/${waiver.tenantId}/${signatureId}.pdf`;
  const buffer = Buffer.from(pdfBytes);
  const { url } = await uploadMedia(buffer, filename, "application/pdf");

  await prisma.waiverSignature.update({
    where: { id: signatureId },
    data: { pdfStorageKey: url },
  });
}
