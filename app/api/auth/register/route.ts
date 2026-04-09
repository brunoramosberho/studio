import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { findMembershipByReferralCode } from "@/lib/referrals/code";
import { sendPushToUser } from "@/lib/push";

export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenant();
    const { email, name, phone, referralCode } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "email required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (user) {
      const updates: Record<string, string> = {};
      if (name && !user.name) updates.name = name;
      if (phone && !user.phone) updates.phone = phone;

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
          name: name || null,
          phone: phone || null,
        },
      });
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
