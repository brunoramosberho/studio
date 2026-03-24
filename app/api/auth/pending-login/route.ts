import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: "email required" }, { status: 400 });
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.pendingLogin.create({
      data: { email: email.toLowerCase(), token, expiresAt },
    });

    return NextResponse.json({ token });
  } catch (error) {
    console.error("POST /api/auth/pending-login error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    const pending = await prisma.pendingLogin.findUnique({ where: { token } });

    if (!pending || pending.expiresAt < new Date()) {
      return NextResponse.json({ approved: false, expired: !pending ? false : true });
    }

    if (pending.approved && pending.sessionToken) {
      await prisma.pendingLogin.delete({ where: { token } });
      return NextResponse.json({
        approved: true,
        sessionToken: pending.sessionToken,
      });
    }

    return NextResponse.json({ approved: false });
  } catch (error) {
    console.error("GET /api/auth/pending-login error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
