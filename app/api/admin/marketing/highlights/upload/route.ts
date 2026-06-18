import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenant";
import { uploadMedia } from "@/lib/supabase-storage";

export async function POST(req: Request) {
  try {
    await requirePermission("marketing");

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { url } = await uploadMedia(buffer, file.name, file.type);

    return NextResponse.json({ url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
