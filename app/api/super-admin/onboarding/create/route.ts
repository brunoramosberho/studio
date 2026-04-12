import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/tenant";
import { createTenantStructure } from "@/lib/onboarding/create-tenant-structure";
import { generateClasses } from "@/lib/onboarding/generate-classes";
import { generateDemoActivity } from "@/lib/onboarding/generate-demo-activity";
import type { ExtractedData } from "@/lib/onboarding/types";

export const maxDuration = 120;

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function POST(req: Request) {
  try {
    const session = await requireSuperAdmin();
    const body = await req.json();

    const slug = body.slug as string;
    if (!slug || !SLUG_REGEX.test(slug)) {
      return NextResponse.json(
        { error: "Slug inválido" },
        { status: 400 },
      );
    }

    // Check slug availability
    const existing = await prisma.tenant.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { error: "Ese slug ya está en uso" },
        { status: 409 },
      );
    }

    const data: ExtractedData = {
      identity: body.identity,
      brand: body.brand,
      locations: body.locations || [],
      disciplines: body.disciplines || [],
      coaches: body.coaches || [],
      packages: body.packages || [],
      schedule: body.schedule || [],
      manualRequired: body.manualRequired || { rooms: true, schedule: true, notes: "" },
      sources: body.sources || {},
    };

    console.log(`[onboarding/create] Creating tenant "${slug}" with ${data.disciplines.length} disciplines, ${data.coaches.length} coaches, ${data.schedule.length} schedule slots`);

    // Step 1: Create tenant + structure (class types, coaches, rooms, packages)
    const structure = await createTenantStructure(data, slug, session.user!.id);
    console.log(`[onboarding/create] Structure created: ${structure.classTypes.length} class types, ${structure.coachProfiles.length} coaches, ${structure.rooms.length} rooms`);

    // Step 2: Generate classes (past week + next 2 weeks)
    const { past, future } = await generateClasses(structure, data.schedule);
    console.log(`[onboarding/create] Classes generated: ${past.length} past, ${future.length} future`);

    // Step 3: Generate demo activity (users, bookings, feed events)
    const activity = await generateDemoActivity(structure, past, future);
    console.log(`[onboarding/create] Demo activity: ${activity.userCount} users, ${activity.bookingCount} bookings, ${activity.feedEventCount} feed events`);

    return NextResponse.json({
      studioId: structure.tenantId,
      slug,
      summary: {
        classTypes: structure.classTypes.length,
        coaches: structure.coachProfiles.length,
        rooms: structure.rooms.length,
        pastClasses: past.length,
        futureClasses: future.length,
        demoUsers: activity.userCount,
        bookings: activity.bookingCount,
        feedEvents: activity.feedEventCount,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error interno";
    if (msg === "Unauthorized") {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    if (msg === "Forbidden") {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    console.error("[onboarding/create]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
