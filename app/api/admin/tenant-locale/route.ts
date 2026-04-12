import { NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";

export async function GET() {
  try {
    const tenant = await getTenant();
    return NextResponse.json({ locale: tenant?.locale ?? "es" });
  } catch {
    return NextResponse.json({ locale: "es" });
  }
}
