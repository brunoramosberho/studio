import { prisma } from "@/lib/db";
import { uploadMedia } from "@/lib/supabase-storage";
import { generateSignedPdf } from "@/lib/waiver/pdf";

/**
 * Generate the signed-waiver PDF for a signature from its stored data and save
 * it to storage (sets `pdfStorageKey`). Everything needed is persisted on the
 * WaiverSignature (the drawing in `signatureData`, name, dates, hash), so this
 * is reusable from both the sign flow (via `after()`, guaranteed to run) and a
 * backfill of older signatures whose fire-and-forget generation never finished.
 *
 * Returns the stored URL, or null if the signature is missing. No-op (returns
 * the existing key) when a PDF is already stored unless `force` is set.
 */
export async function generateAndStoreWaiverPdf(
  signatureId: string,
  { force = false }: { force?: boolean } = {},
): Promise<string | null> {
  const sig = await prisma.waiverSignature.findUnique({
    where: { id: signatureId },
    include: {
      waiver: { select: { title: true, content: true, version: true, tenantId: true } },
      tenant: { select: { name: true } },
    },
  });
  if (!sig) return null;
  if (sig.pdfStorageKey && !force) return sig.pdfStorageKey;

  const studioName = sig.tenant?.name ?? "";
  const bd = sig.participantBirthDate;
  // `@db.Date` reads at UTC midnight — format from UTC parts to avoid an
  // off-by-one day in non-UTC environments.
  const birthDate = bd
    ? `${String(bd.getUTCDate()).padStart(2, "0")}/${String(
        bd.getUTCMonth() + 1,
      ).padStart(2, "0")}/${bd.getUTCFullYear()}`
    : undefined;

  const pdfBytes = await generateSignedPdf({
    waiverTitle: sig.waiver.title,
    waiverContent: sig.waiver.content
      .replace(/\{\{nombre_estudio\}\}/g, studioName)
      .replace(/\{\{nombre_cliente\}\}/g, sig.participantName),
    studioName,
    memberName: sig.participantName,
    phone: sig.participantPhone,
    birthDate,
    signatureBase64: sig.signatureData,
    signatureHash: sig.signatureHash,
    ipAddress: sig.ipAddress ?? "",
    signedAt: sig.signedAt,
    waiverVersion: sig.waiverVersion,
  });

  const filename = `waivers/${sig.waiver.tenantId}/${signatureId}.pdf`;
  const { url } = await uploadMedia(
    Buffer.from(pdfBytes),
    filename,
    "application/pdf",
  );

  await prisma.waiverSignature.update({
    where: { id: signatureId },
    data: { pdfStorageKey: url },
  });
  return url;
}
