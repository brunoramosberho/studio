import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";

export async function GET() {
  const ctx = await getAuthContext();
  const session = ctx?.session;
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, phone: true, image: true, countryId: true, cityId: true, instagramUser: true, stravaUser: true, locale: true },
  });

  return NextResponse.json(user);
}

export async function PUT(request: NextRequest) {
  const ctx = await getAuthContext();
  const session = ctx?.session;
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, phone, countryId, cityId, instagramUser, stravaUser, locale } = body;

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(name !== undefined && { name }),
      ...(phone !== undefined && { phone }),
      ...(countryId !== undefined && { countryId: countryId || null }),
      ...(cityId !== undefined && { cityId: cityId || null }),
      ...(instagramUser !== undefined && { instagramUser: instagramUser?.trim() || null }),
      ...(stravaUser !== undefined && { stravaUser: stravaUser?.trim() || null }),
      ...(locale !== undefined && { locale: locale === "en" || locale === "es" ? locale : null }),
    },
    select: { id: true, name: true, email: true, phone: true, image: true, countryId: true, cityId: true, instagramUser: true, stravaUser: true, locale: true },
  });

  return NextResponse.json(updated);
}
