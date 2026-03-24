import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { uploadMedia } from "@/lib/supabase-storage";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const filename = `avatars/${session.user.id}-${Date.now()}.${ext}`;

    const result = await uploadMedia(buffer, filename, file.type);

    if (!result) {
      // Fallback: store as base64 data URL if Supabase is not configured
      const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;
      await prisma.user.update({
        where: { id: session.user.id },
        data: { image: base64 },
      });
      return NextResponse.json({ image: base64 });
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { image: result.url },
    });

    return NextResponse.json({ image: result.url });
  } catch (error) {
    console.error("POST /api/profile/avatar error:", error);
    return NextResponse.json({ error: "Error al subir la imagen" }, { status: 500 });
  }
}
