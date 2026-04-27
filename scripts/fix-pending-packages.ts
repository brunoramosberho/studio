/**
 * Limpia UserPackages atascados en PENDING_PAYMENT. Recorre todos los paquetes
 * en ese estado y decide qué hacer en función del StripePayment / MemberSubscription:
 *
 *   - Pago succeeded en Stripe       → activar (ACTIVE).
 *   - Pago failed en Stripe          → marcar PAYMENT_FAILED.
 *   - Suscripción active en Stripe   → activar (ACTIVE).
 *   - Sin pago / pago pendiente >24h → revocar (REVOKED, "abandoned").
 *   - Pago pending <24h              → dejar como está (en curso).
 *
 * Uso:
 *   npx tsx scripts/fix-pending-packages.ts                 # dry-run global
 *   npx tsx scripts/fix-pending-packages.ts --apply         # aplica cambios
 *   npx tsx scripts/fix-pending-packages.ts --tenant=betoro # filtra por tenant
 *   npx tsx scripts/fix-pending-packages.ts --user=<id>     # filtra por user
 *   npx tsx scripts/fix-pending-packages.ts --userPackage=<id>
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}
const APPLY = process.argv.includes("--apply");
const TENANT_SLUG = getArg("tenant");
const USER_ID = getArg("user");
const USER_PACKAGE_ID = getArg("userPackage");

type Action = "ACTIVATE" | "REVOKE" | "MARK_FAILED" | "SKIP";

interface Decision {
  upId: string;
  userEmail: string;
  tenantSlug: string;
  packageName: string;
  purchasedAt: Date;
  expiresAt: Date;
  action: Action;
  reason: string;
}

async function decide(up: {
  id: string;
  userId: string;
  packageId: string;
  tenantId: string;
  purchasedAt: Date;
  expiresAt: Date;
  stripePaymentId: string | null;
  package: { name: string; type: string };
  user: { email: string | null };
  tenant: { slug: string };
}): Promise<Decision> {
  const base = {
    upId: up.id,
    userEmail: up.user.email ?? "(no email)",
    tenantSlug: up.tenant.slug,
    packageName: up.package.name,
    purchasedAt: up.purchasedAt,
    expiresAt: up.expiresAt,
  };

  // 1) Buscar StripePayment por referenceId (paquete) o por stripePaymentId
  const payments = await prisma.stripePayment.findMany({
    where: {
      tenantId: up.tenantId,
      memberId: up.userId,
      OR: [
        { referenceId: up.id },
        ...(up.stripePaymentId && up.stripePaymentId !== "pending_stripe"
          ? [{ stripePaymentIntentId: up.stripePaymentId }]
          : []),
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  const succeeded = payments.find((p) => p.status === "succeeded");
  const failed = payments.find((p) => p.status === "failed");
  const pending = payments.find((p) => p.status === "pending");

  if (succeeded) {
    return { ...base, action: "ACTIVATE", reason: `pago succeeded (${succeeded.stripePaymentIntentId})` };
  }

  // 2) Si es paquete de suscripción, mirar MemberSubscription
  if (up.package.type === "SUBSCRIPTION") {
    const subs = await prisma.memberSubscription.findMany({
      where: {
        tenantId: up.tenantId,
        userId: up.userId,
        packageId: up.packageId,
      },
      orderBy: { createdAt: "desc" },
    });
    const activeSub = subs.find((s) => s.status === "active" || s.status === "trialing");
    if (activeSub) {
      return {
        ...base,
        action: "ACTIVATE",
        reason: `suscripción ${activeSub.status} (${activeSub.stripeSubscriptionId})`,
      };
    }
    if (subs.length > 0) {
      return {
        ...base,
        action: "REVOKE",
        reason: `suscripción no activa: ${subs.map((s) => s.status).join(",")}`,
      };
    }
  }

  if (failed && !pending) {
    return { ...base, action: "MARK_FAILED", reason: `pago failed (${failed.stripePaymentIntentId})` };
  }

  const ageMs = Date.now() - up.purchasedAt.getTime();
  const ONE_DAY = 24 * 60 * 60 * 1000;

  if (pending && ageMs < ONE_DAY) {
    return { ...base, action: "SKIP", reason: "pago pending <24h en curso" };
  }

  return { ...base, action: "REVOKE", reason: pending ? "pago pending >24h, abandonado" : "sin pago asociado" };
}

async function main() {
  const where: Record<string, unknown> = { status: "PENDING_PAYMENT" };
  if (USER_PACKAGE_ID) where.id = USER_PACKAGE_ID;
  if (USER_ID) where.userId = USER_ID;
  if (TENANT_SLUG) {
    const t = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
    if (!t) throw new Error(`Tenant ${TENANT_SLUG} no existe`);
    where.tenantId = t.id;
  }

  const pkgs = await prisma.userPackage.findMany({
    where,
    include: {
      package: { select: { name: true, type: true } },
      user: { select: { email: true } },
      tenant: { select: { slug: true } },
    },
    orderBy: { purchasedAt: "asc" },
  });

  console.log(`\n${pkgs.length} UserPackage en PENDING_PAYMENT.${APPLY ? "" : " (dry-run; usa --apply para aplicar)"}\n`);

  const decisions: Decision[] = [];
  for (const up of pkgs) {
    decisions.push(await decide(up));
  }

  const summary: Record<Action, number> = { ACTIVATE: 0, REVOKE: 0, MARK_FAILED: 0, SKIP: 0 };
  for (const d of decisions) {
    summary[d.action]++;
    console.log(
      `[${d.action.padEnd(11)}] tenant=${d.tenantSlug.padEnd(15)} user=${d.userEmail.padEnd(35)} pkg="${d.packageName}" purchased=${d.purchasedAt.toISOString().slice(0, 10)} → ${d.reason}`,
    );
  }
  console.log(`\nResumen: ${JSON.stringify(summary)}\n`);

  if (!APPLY) return;

  console.log("Aplicando cambios…");
  for (const d of decisions) {
    if (d.action === "ACTIVATE") {
      await prisma.userPackage.update({
        where: { id: d.upId },
        data: { status: "ACTIVE" },
      });
    } else if (d.action === "REVOKE") {
      await prisma.userPackage.update({
        where: { id: d.upId },
        data: {
          status: "REVOKED",
          revokedAt: new Date(),
          revokedReason: "manual_cleanup",
        },
      });
    } else if (d.action === "MARK_FAILED") {
      await prisma.userPackage.update({
        where: { id: d.upId },
        data: {
          status: "PAYMENT_FAILED",
          revokedAt: new Date(),
          revokedReason: "payment_failed",
        },
      });
    }
  }
  console.log("Listo.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
