import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { capitalizeName, composeName, splitName } from "@/lib/utils";

const SELECT = {
  id: true,
  name: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  birthday: true,
  image: true,
  countryId: true,
  cityId: true,
  instagramUser: true,
  stravaUser: true,
  locale: true,
  gender: true,
} as const;

export async function GET() {
  const ctx = await getAuthContext();
  const session = ctx?.session;
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: SELECT,
  });

  if (!user) return NextResponse.json(null);

  // A profile is "complete" once we have a first name, last name and birthday —
  // the fields the complete-profile gate collects for Google/OAuth signups.
  const profileComplete = Boolean(user.firstName && user.lastName && user.birthday);

  return NextResponse.json({
    ...user,
    birthday: user.birthday
      ? user.birthday.toISOString().slice(0, 10)
      : null,
    profileComplete,
  });
}

export async function PUT(request: NextRequest) {
  const ctx = await getAuthContext();
  const session = ctx?.session;
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { phone, countryId, cityId, instagramUser, stravaUser, locale, gender } = body;

  const data: Record<string, unknown> = {};

  // Name: accept structured first/last, or split a legacy single `name`.
  const hasStructuredName =
    body.firstName !== undefined || body.lastName !== undefined;
  if (hasStructuredName) {
    const firstName = capitalizeName(String(body.firstName ?? "").trim()) || null;
    const lastName = capitalizeName(String(body.lastName ?? "").trim()) || null;
    data.firstName = firstName;
    data.lastName = lastName;
    data.name = composeName(firstName, lastName);
  } else if (body.name !== undefined) {
    const name = String(body.name).trim() || null;
    const { firstName, lastName } = splitName(name);
    data.name = name;
    data.firstName = firstName ? capitalizeName(firstName) : null;
    data.lastName = lastName ? capitalizeName(lastName) : null;
  }

  if (body.birthday !== undefined) {
    if (typeof body.birthday === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.birthday)) {
      const parsed = new Date(`${body.birthday}T00:00:00.000Z`);
      data.birthday = Number.isNaN(parsed.getTime()) ? null : parsed;
    } else {
      data.birthday = null;
    }
  }

  if (phone !== undefined) data.phone = phone;
  if (countryId !== undefined) data.countryId = countryId || null;
  if (cityId !== undefined) data.cityId = cityId || null;
  if (instagramUser !== undefined) data.instagramUser = instagramUser?.trim() || null;
  if (stravaUser !== undefined) data.stravaUser = stravaUser?.trim() || null;
  if (locale !== undefined) data.locale = locale === "en" || locale === "es" ? locale : null;
  if (gender !== undefined) data.gender = ["male", "female", "other"].includes(gender) ? gender : null;

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: SELECT,
  });

  return NextResponse.json({
    ...updated,
    birthday: updated.birthday ? updated.birthday.toISOString().slice(0, 10) : null,
  });
}
