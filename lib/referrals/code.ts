import { prisma } from "@/lib/db";

export async function getOrCreateReferralCode(
  userId: string,
  tenantId: string,
): Promise<string> {
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { referralCode: true, user: { select: { name: true } } },
  });

  if (!membership) throw new Error("Membership not found");
  if (membership.referralCode) return membership.referralCode;

  const firstName = (membership.user.name ?? "REF").split(" ")[0];
  const base = firstName
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z]/g, "")
    .slice(0, 8) || "REF";

  let code: string;
  let attempts = 0;

  do {
    const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    code = `${base}-${suffix}`;
    const existing = await prisma.membership.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });
    if (!existing) break;
    attempts++;
  } while (attempts < 10);

  await prisma.membership.update({
    where: { userId_tenantId: { userId, tenantId } },
    data: { referralCode: code },
  });

  return code;
}

export async function findMembershipByReferralCode(
  referralCode: string,
  tenantId: string,
) {
  return prisma.membership.findFirst({
    where: { referralCode, tenantId },
    select: {
      id: true,
      userId: true,
      user: {
        select: { id: true, name: true, image: true },
      },
    },
  });
}
