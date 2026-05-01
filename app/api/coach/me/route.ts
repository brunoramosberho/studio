import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";

// Returns the current coach's public-facing identity (studio-curated photo
// and display name). Used by the coach portal header so the avatar shown is
// the studio photo rather than the user's personal/Google image.
export async function GET() {
  try {
    const { session, tenant } = await requireAuth();

    const coach = await prisma.coachProfile.findFirst({
      where: { userId: session.user.id, tenantId: tenant.id },
      select: {
        id: true,
        name: true,
        photoUrl: true,
        color: true,
        specialties: true,
      },
    });

    if (!coach) {
      return NextResponse.json({ error: "Not a coach" }, { status: 403 });
    }

    return NextResponse.json({ coach });
  } catch (error) {
    console.error("GET /api/coach/me error:", error);
    return NextResponse.json(
      { error: "Failed to load coach" },
      { status: 500 },
    );
  }
}
