import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaffManagement } from "../_auth";
import { nationalHolidays, holidayKey } from "@/lib/holidays/calendar";

// Festivos management for the holiday surcharge on coach pay rates. National
// holidays are computed from the tenant's country (read-only); regional/local
// festivos are stored as TenantHoliday rows the admin can add or remove.

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireStaffManagement();
    const yearParam = request.nextUrl.searchParams.get("year");
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getUTCFullYear();

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenant.id },
      select: { defaultCountry: { select: { code: true, name: true } } },
    });

    const custom = await prisma.tenantHoliday.findMany({
      where: { tenantId: ctx.tenant.id },
      orderBy: { date: "asc" },
      select: { id: true, date: true, name: true },
    });

    return NextResponse.json({
      year,
      countryCode: tenant?.defaultCountry?.code ?? null,
      countryName: tenant?.defaultCountry?.name ?? null,
      national: nationalHolidays(tenant?.defaultCountry?.code, year),
      custom: custom.map((c) => ({ id: c.id, date: holidayKey(new Date(c.date)), name: c.name })),
    });
  } catch (error) {
    console.error("GET staff/holidays error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireStaffManagement();
    const { date, name } = await request.json();

    if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Fecha inválida (formato YYYY-MM-DD)" }, { status: 400 });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
    }

    // Store as a UTC calendar day so it lines up with holidayKey() in the calc.
    const parsed = new Date(`${date}T00:00:00.000Z`);

    const holiday = await prisma.tenantHoliday.upsert({
      where: { tenantId_date: { tenantId: ctx.tenant.id, date: parsed } },
      update: { name: name.trim() },
      create: { tenantId: ctx.tenant.id, date: parsed, name: name.trim() },
      select: { id: true, date: true, name: true },
    });

    return NextResponse.json(
      { id: holiday.id, date: holidayKey(new Date(holiday.date)), name: holiday.name },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST staff/holidays error:", error);
    return NextResponse.json({ error: "Error al crear" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await requireStaffManagement();
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "id requerido" }, { status: 400 });
    }

    const existing = await prisma.tenantHoliday.findFirst({
      where: { id, tenantId: ctx.tenant.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Festivo no encontrado" }, { status: 404 });
    }

    await prisma.tenantHoliday.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE staff/holidays error:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
