import "server-only";
import { prisma } from "@/lib/db";

/**
 * Maps a pass serial number ("<tenantSlug>.<userId>") back to its tenant + user
 * ids, so the PassKit web service can rebuild a pass without a session.
 */
export async function resolvePassSerial(
  serialNumber: string,
): Promise<{ tenantId: string; userId: string } | null> {
  const idx = serialNumber.indexOf(".");
  if (idx < 0) return null;
  const slug = serialNumber.slice(0, idx);
  const userId = serialNumber.slice(idx + 1);
  if (!slug || !userId) return null;
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  return tenant ? { tenantId: tenant.id, userId } : null;
}
