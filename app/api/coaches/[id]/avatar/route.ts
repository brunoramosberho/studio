import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { uploadMedia } from "@/lib/supabase-storage";

const MAX_SIZE = 5 * 1024 * 1024;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const { id: userId } = await params;

    const isOwner = ctx.session.user.id === userId;
    const isAdmin = ctx.membership.role === "ADMIN" || ctx.membership.role === "OWNER";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const coach = await prisma.coachProfile.findFirst({
      where: { userId, tenantId: ctx.tenant.id },
    });

    if (!coach) {
      return NextResponse.json({ error: "Coach no encontrado" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "El archivo debe ser una imagen" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "La imagen no puede pesar más de 5 MB" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop() || "jpg";
    const filename = `coaches/${coach.id}-${Date.now()}.${ext}`;

    const result = await uploadMedia(buffer, filename, file.type);

    if (!result) {
      const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;
      await prisma.coachProfile.update({
        where: { id: coach.id },
        data: { photoUrl: base64 },
      });
      return NextResponse.json({ photoUrl: base64 });
    }

    await prisma.coachProfile.update({
      where: { id: coach.id },
      data: { photoUrl: result.url },
    });

    return NextResponse.json({ photoUrl: result.url });
  } catch (error) {
    console.error("POST /api/coaches/[id]/avatar error:", error);
    return NextResponse.json({ error: "Error al subir la imagen" }, { status: 500 });
  }
}
