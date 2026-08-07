import { PrismaClient } from "@prisma/client";
import { withConnectionLimit } from "./db-url";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * One connection per serverless instance when we're behind the pooler — see
 * lib/db-url.ts for why. Applied here rather than in the environment variable
 * so it lives in the repo, gets reviewed, and can't be lost the next time
 * someone edits the connection string.
 */
const url = withConnectionLimit(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(url ? { datasources: { db: { url } } } : undefined);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
