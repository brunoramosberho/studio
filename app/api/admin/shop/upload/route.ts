import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/tenant";
import { uploadMedia } from "@/lib/supabase-storage";

const MAX_SIZE = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    await requireRole("ADMIN");

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "El archivo debe ser una imagen" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Máximo 5 MB" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop() || "jpg";
    const filename = `shop/${Date.now()}.${ext}`;

    const result = await uploadMedia(buffer, filename, file.type);
    if (!result) {
      return NextResponse.json({ error: "Error al subir imagen" }, { status: 500 });
    }

    return NextResponse.json({ url: result.url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
