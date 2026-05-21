import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";

/**
 * Capture a Lead from a public-facing flow (guest checkout info step, package
 * purchase form, magic-link request, etc.). Idempotent: upserts by
 * (tenantId, email) so repeated submissions don't create duplicates and
 * preserve the conversion link if it already happened.
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenant();
    const body = await request.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const name = body.name ? String(body.name).trim() : null;
    const phone = body.phone ? String(body.phone).trim() : null;
    const source = body.source ? String(body.source).trim().slice(0, 64) : null;

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    // Skip if this email already corresponds to a real User (they're not a
    // lead anymore). We still touch updatedAt on the existing Lead row if any.
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      const existingMembership = await prisma.membership.findUnique({
        where: {
          userId_tenantId: { userId: existingUser.id, tenantId: tenant.id },
        },
        select: { id: true, role: true },
      });
      // Skip only if they're already a CLIENT — coaches/admins might still
      // legitimately convert to customers later, and we want to track that.
      if (existingMembership && existingMembership.role === "CLIENT") {
        return NextResponse.json({ ok: true, skipped: "already_client" });
      }
    }

    const lead = await prisma.lead.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      create: {
        tenantId: tenant.id,
        email,
        name,
        phone,
        source,
      },
      update: {
        name: name ?? undefined,
        phone: phone ?? undefined,
        source: source ?? undefined,
      },
    });

    return NextResponse.json({ ok: true, id: lead.id });
  } catch (err) {
    console.error("[leads.create]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
