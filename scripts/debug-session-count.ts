/**
 * Quick check: how many valid sessions does the user have?
 * And what are the most recent ones?
 */
import { prisma } from "../lib/db";

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: "brunoramosberho@gmail.com" },
    select: { id: true },
  });
  if (!user) {
    console.error("user not found");
    return;
  }

  const validCount = await prisma.session.count({
    where: { userId: user.id, expires: { gt: new Date() } },
  });
  const totalCount = await prisma.session.count({
    where: { userId: user.id },
  });

  console.log("userId:", user.id);
  console.log("totalCount:", totalCount);
  console.log("validCount:", validCount);

  const recent = await prisma.session.findMany({
    where: { userId: user.id },
    orderBy: { expires: "desc" },
    take: 10,
    select: {
      id: true,
      sessionToken: true,
      expires: true,
    },
  });
  console.log("Most recent 10 sessions:");
  for (const s of recent) {
    console.log(
      `  ${s.id} | ${s.sessionToken.slice(0, 8)}... | expires ${s.expires.toISOString()} | ${s.expires < new Date() ? "EXPIRED" : "valid"}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
