/**
 * Diagnostica por qué un usuario no puede reservar una clase en un tenant.
 * Inspecciona paquetes activos, asignaciones por classType, créditos usados,
 * fechas de expiración y deuda pendiente.
 *
 * Uso:
 *   npx tsx scripts/debug-user-packages.ts --tenant=betoro --email=reginaelvegetal@gmail.com
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

const SLUG = getArg("tenant");
const EMAIL = getArg("email");

if (!SLUG || !EMAIL) {
  console.error("Uso: --tenant=<slug> --email=<email>");
  process.exit(1);
}

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: SLUG! },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) throw new Error(`Tenant ${SLUG} no encontrado`);

  console.log(`\n=== TENANT: ${tenant.name} (${tenant.slug}) — id=${tenant.id} ===\n`);

  const user = await prisma.user.findFirst({
    where: { email: EMAIL! },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      memberships: {
        select: { tenantId: true, role: true, tenant: { select: { slug: true } } },
      },
    },
  });

  if (!user) {
    console.log(`Usuario ${EMAIL} NO existe en la base de datos.`);
    return;
  }
  console.log(`Memberships: ${JSON.stringify(user.memberships, null, 2)}`);
  const memb = user.memberships.find((m) => m.tenantId === tenant.id);
  if (!memb) {
    console.log(`AVISO: el usuario no tiene Membership en este tenant.`);
  }

  console.log(`Usuario: ${user.name} <${user.email}>  id=${user.id}\n`);

  const now = new Date();

  // --- ALL packages (any status) ---
  const all = await prisma.userPackage.findMany({
    where: { userId: user.id, tenantId: tenant.id },
    include: {
      package: {
        include: {
          classTypes: { select: { id: true, name: true } },
          creditAllocations: { select: { classTypeId: true, credits: true } },
        },
      },
      creditUsages: {
        select: { classTypeId: true, creditsTotal: true, creditsUsed: true },
      },
    },
    orderBy: { purchasedAt: "desc" },
  });

  console.log(`Total UserPackage: ${all.length}\n`);

  for (const up of all) {
    const expired = up.expiresAt < now;
    const active = up.status === "ACTIVE" && !expired;
    console.log(
      `- [${active ? "VALID " : "INVALID"}] ${up.package.name}`,
    );
    console.log(`    upId=${up.id}  status=${up.status}  purchasedAt=${up.purchasedAt.toISOString()}  expiresAt=${up.expiresAt.toISOString()}  expired=${expired}`);
    console.log(`    creditsTotal=${up.creditsTotal}  creditsUsed=${up.creditsUsed}  unlimited=${up.creditsTotal === null}`);
    if (up.package.classTypes.length > 0) {
      console.log(
        `    classTypes permitidos: ${up.package.classTypes.map((c) => `${c.name}(${c.id})`).join(", ")}`,
      );
    } else {
      console.log(`    classTypes permitidos: (todos)`);
    }
    if (up.package.creditAllocations.length > 0) {
      console.log(`    Allocations definidas:`);
      for (const a of up.package.creditAllocations) {
        console.log(`      - classTypeId=${a.classTypeId} credits=${a.credits}`);
      }
      console.log(`    Usos por classType:`);
      for (const u of up.creditUsages) {
        console.log(
          `      - classTypeId=${u.classTypeId}  used=${u.creditsUsed}/${u.creditsTotal}`,
        );
      }
    }
    console.log("");
  }

  // --- ClassTypes available in tenant ---
  const classTypes = await prisma.classType.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true },
  });
  console.log(`ClassTypes en tenant:`);
  for (const ct of classTypes) console.log(`  - ${ct.name}  id=${ct.id}`);
  console.log("");

  // --- Stripe payments del usuario en el tenant ---
  const payments = await prisma.stripePayment.findMany({
    where: { tenantId: tenant.id, memberId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  console.log(`StripePayments (${payments.length}):`);
  for (const p of payments) {
    console.log(
      `  - ${p.createdAt.toISOString()}  status=${p.status}  type=${p.type}  amount=${p.amount}${p.currency}  refId=${p.referenceId}  pi=${p.stripePaymentIntentId}`,
    );
  }
  console.log("");

  // --- Open debt? ---
  const debt = await prisma.debt.findFirst({
    where: { userId: user.id, tenantId: tenant.id, status: "OPEN" },
    select: { id: true, amount: true, currency: true, reason: true, createdAt: true },
  }).catch(() => null);
  if (debt) {
    console.log(`DEUDA ABIERTA: ${JSON.stringify(debt, null, 2)}`);
  } else {
    console.log("Sin deuda abierta.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
