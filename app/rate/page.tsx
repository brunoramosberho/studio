import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyRatingToken } from "@/lib/ratings/token";
import { getAuthContext, requireTenant } from "@/lib/tenant";
import { RatingReasonsPage } from "./rating-reasons-page";
import { RatingThankYouPage } from "./rating-thank-you-page";
import { TokenExpiredPage } from "./token-expired-page";
import { RedirectToFeed } from "./redirect-to-feed";

export default async function RatePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) redirect("/");

  const payload = await verifyRatingToken(token);
  if (!payload) return <TokenExpiredPage />;

  const { userId, classId, tenantId, rating } = payload;

  const tenant = await requireTenant();
  if (tenant.id !== tenantId) return <TokenExpiredPage />;

  await prisma.classRating.upsert({
    where: { userId_classId: { userId, classId } },
    create: { userId, classId, tenantId, rating, source: "email", emailToken: token },
    update: { rating, source: "email" },
  });

  const classData = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      classType: { select: { id: true, name: true, color: true } },
      coach: { select: { name: true, photoUrl: true, color: true, user: { select: { image: true } } } },
    },
  });

  const ctx = await getAuthContext();
  const isLoggedIn = !!ctx?.session?.user?.id;

  if (rating <= 3) {
    return (
      <RatingReasonsPage
        classId={classId}
        classTypeId={classData?.classType.id ?? ""}
        className={classData?.classType.name ?? ""}
        coachName={classData?.coach.name ?? ""}
        coachPhoto={classData?.coach.photoUrl || classData?.coach.user?.image || null}
        coachColor={classData?.coach.color ?? "#C9A96E"}
        startsAt={classData?.startsAt.toISOString() ?? ""}
        rating={rating}
        isLoggedIn={isLoggedIn}
      />
    );
  }

  // Rating alto (4-5): página de agradecimiento con opción de ir al feed
  return (
    <RatingThankYouPage
      rating={rating}
      classId={classId}
      className={classData?.classType.name ?? ""}
      coachName={classData?.coach.name ?? ""}
      coachPhoto={classData?.coach.photoUrl || classData?.coach.user?.image || null}
      coachColor={classData?.coach.color ?? "#C9A96E"}
      startsAt={classData?.startsAt.toISOString() ?? ""}
      isLoggedIn={isLoggedIn}
    />
  );
}
