import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";

export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenant();
    const { email, name, phone } = await request.json();

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

    if (!existingMembership) {
      await prisma.membership.create({
        data: { userId: user.id, tenantId: tenant.id, role: "CLIENT" },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/auth/register error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
