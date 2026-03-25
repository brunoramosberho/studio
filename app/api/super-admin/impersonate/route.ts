import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/tenant";

export async function POST(req: Request) {
  try {
    await requireSuperAdmin();

    const body = await req.json();
    const { tenantSlug } = body as { tenantSlug?: string };

    if (!tenantSlug) {
      return NextResponse.json(
        { error: "tenantSlug es requerido" },
        { status: 400 },
      );
    }

    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";
    const protocol = rootDomain.includes("localhost") ? "http" : "https";
    const url = `${protocol}://${tenantSlug}.${rootDomain}/admin`;

    return NextResponse.json({ url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
