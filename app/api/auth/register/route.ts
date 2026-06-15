import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { findMembershipByReferralCode } from "@/lib/referrals/code";
import { sendPushToUser } from "@/lib/push";
import { guessGenderFromName } from "@/lib/ai/guess-gender";
import { capitalizeName, composeName, splitName } from "@/lib/utils";

export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenant();
    const body = await request.json();
    const { email, phone, referralCode } = body;

    if (!email) {
      return NextResponse.json({ error: "email required" }, { status: 400 });
    }

    // Accept structured first/last name; fall back to splitting a legacy `name`.
    const fromName = splitName(body.name);
    const firstName = capitalizeName((body.firstName ?? fromName.firstName ?? "").trim()) || null;
    const lastName = capitalizeName((body.lastName ?? fromName.lastName ?? "").trim()) || null;
    const name = composeName(firstName, lastName);

    let birthday: Date | null = null;
    if (typeof body.birthday === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.birthday)) {
      const parsed = new Date(`${body.birthday}T00:00:00.000Z`);
      if (!Number.isNaN(parsed.getTime())) birthday = parsed;
    }

    const normalizedEmail = email.toLowerCase().trim();

    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (user) {
      // Only fill blanks — never overwrite data the user already has.
      const updates: Record<string, unknown> = {};
      if (firstName && !user.firstName) updates.firstName = firstName;
      if (lastName && !user.lastName) updates.lastName = lastName;
      if (name && !user.name) updates.name = name;
      if (phone && !user.phone) updates.phone = phone;
      if (birthday && !user.birthday) updates.birthday = birthday;

      if (Object.keys(updates).length > 0) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: updates,
        });
      }
    } else {
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          firstName,
          lastName,
          name,
          phone: phone || null,
          birthday,
        },
      });

      // AI gender detection — fire-and-forget so it never blocks registration
      if (firstName) {
        const userId = user.id;
        guessGenderFromName(firstName).then((gender) => {
          if (gender) {
            prisma.user.update({ where: { id: userId }, data: { gender } }).catch(() => {});
          }
        }).catch(() => {});
      }
    }

    const existingMembership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
    });

    let membership = existingMembership;

    if (!membership) {
      membership = await prisma.membership.create({
        data: { userId: user.id, tenantId: tenant.id, role: "CLIENT" },
      });
    }

    // Link referral if code provided and membership doesn't already have one (first-touch wins)
    if (referralCode && !membership.referredByMembershipId) {
      const referrer = await findMembershipByReferralCode(referralCode, tenant.id);

      if (referrer && referrer.userId !== user.id) {
        await prisma.membership.update({
          where: { id: membership.id },
          data: { referredByMembershipId: referrer.id },
        });

        // Auto-friend: create bidirectional friendship
        await prisma.friendship.createMany({
          data: [
            {
              requesterId: user.id,
              addresseeId: referrer.userId,
              tenantId: tenant.id,
              status: "ACCEPTED",
            },
            {
              requesterId: referrer.userId,
              addresseeId: user.id,
              tenantId: tenant.id,
              status: "ACCEPTED",
            },
          ],
          skipDuplicates: true,
        });

        // Notify the referrer
        const newUserName = (name || email.split("@")[0]).split(" ")[0];

        await prisma.notification.create({
          data: {
            userId: referrer.userId,
            type: "REFERRAL_JOINED",
            actorId: user.id,
            tenantId: tenant.id,
          },
        });

        sendPushToUser(referrer.userId, {
          title: "Tu invitación funcionó 🎉",
          body: `${newUserName} se unió con tu link de invitación`,
          url: "/my/referrals",
          tag: `referral-joined-${user.id}`,
        }, tenant.id).catch(() => {});
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/auth/register error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
