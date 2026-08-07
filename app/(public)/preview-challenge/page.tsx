import { prisma } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { ACTIVE_COACH } from "@/lib/coach/archive";
import PreviewClient, { type PreviewRoster } from "./preview-client";

/**
 * A gallery of every challenge-card state, rendered with the tenant's own
 * branding, disciplines and instructors so a studio can be shown how the
 * feature would look to their members before they run a real challenge.
 *
 * Deliberately open, including in production: this is here to be shared. It is
 * linked from nowhere and marked noindex, so the only way in is the URL.
 *
 * The disciplines and instructors are real because they are already public —
 * both are listed on the studio's own site. The scoreboard names are invented
 * and must stay that way: this page has no session, and who trains where is
 * not public information.
 *
 * Meant to be temporary. Delete the route once the studios have seen it.
 */
export default async function PreviewChallengePage() {
  const tenant = await getTenant();

  let roster: PreviewRoster | null = null;
  if (tenant) {
    const [disciplines, coaches] = await Promise.all([
      prisma.classType.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, name: true, color: true },
        orderBy: { name: "asc" },
        take: 6,
      }),
      prisma.coachProfile.findMany({
        where: { tenantId: tenant.id, ...ACTIVE_COACH },
        select: { id: true, name: true, photoUrl: true },
        orderBy: { name: "asc" },
        take: 6,
      }),
    ]);
    // A studio with nothing set up yet falls back to the sample names rather
    // than showing an empty checklist that makes the feature look broken.
    if (disciplines.length > 0 && coaches.length > 0) {
      roster = { disciplines, coaches };
    }
  }

  return <PreviewClient roster={roster} />;
}

export const metadata = {
  robots: { index: false, follow: false },
};
