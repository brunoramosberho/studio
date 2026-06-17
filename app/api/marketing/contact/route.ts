import { NextResponse } from "next/server";
import { sendMarketingLeadEmail } from "@/lib/email";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Honeypot: real users never fill this hidden field.
  if (clean(body.company)) {
    return NextResponse.json({ ok: true });
  }

  const name = clean(body.name, 120);
  const email = clean(body.email, 160);
  const studioType = clean(body.studioType, 80);
  const size = clean(body.size, 80);
  const link = clean(body.link, 200);

  if (!name || !email || !studioType || !size) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  try {
    await sendMarketingLeadEmail({ name, email, studioType, size, link });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to send marketing lead:", error);
    return NextResponse.json({ error: "send_failed" }, { status: 500 });
  }
}
