import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Apple posts device-side error logs here. We just acknowledge + record them. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.warn("[apple-pass] device log:", JSON.stringify(body?.logs ?? body));
  } catch {}
  return new NextResponse(null, { status: 200 });
}
