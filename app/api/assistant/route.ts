import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { streamAssistantResponse, type AssistantMessage } from "@/lib/claude";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { requireTenant } from "@/lib/tenant";

export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenant();
    const body = await request.json();
    const { messages } = body as { messages: AssistantMessage[] };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "messages array is required" },
        { status: 400 },
      );
    }

    if (messages.length > 8) {
      return NextResponse.json(
        { error: "Maximum 8 messages allowed" },
        { status: 400 },
      );
    }

    const now = new Date();
    const weekAhead = new Date(now);
    weekAhead.setDate(weekAhead.getDate() + 7);

    const upcomingClasses = await prisma.class.findMany({
      where: {
        tenantId: tenant.id,
        startsAt: { gte: now, lte: weekAhead },
        status: "SCHEDULED",
      },
      include: {
        classType: true,
        room: { include: { studio: true } },
        coach: { include: { user: { select: { name: true } } } },
        _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
      },
      orderBy: { startsAt: "asc" },
      take: 30,
    });

    const scheduleContext = upcomingClasses
      .map((c) => {
        const spotsLeft = c.room.maxCapacity - c._count.bookings;
        const day = format(c.startsAt, "EEEE d 'de' MMMM", { locale: es });
        const time = format(c.startsAt, "h:mm a");
        return `- ${c.classType.name} | ${day} ${time} | Coach: ${c.coach.user.name} | Nivel: ${c.classType.level} | Lugares: ${spotsLeft}/${c.room.maxCapacity} | Estudio: ${c.room.studio.name}`;
      })
      .join("\n");

    const stream = await streamAssistantResponse(messages, scheduleContext);

    return new Response(stream.toReadableStream(), {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("POST /api/assistant error:", error);
    return NextResponse.json(
      { error: "Failed to get assistant response" },
      { status: 500 },
    );
  }
}
