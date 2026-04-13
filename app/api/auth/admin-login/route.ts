import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  try {
    const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      return NextResponse.json(
        { error: "Admin credentials not configured" },
        { status: 500 },
      );
    }

    const body = await request.json();
    const { email, password } = body as { email?: string; password?: string };

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email y contraseña requeridos" },
        { status: 400 },
      );
    }

    if (email.toLowerCase().trim() !== adminEmail || password !== adminPassword) {
      return NextResponse.json(
        { error: "Credenciales incorrectas" },
        { status: 401 },
      );
    }

    let user = await prisma.user.findUnique({
      where: { email: adminEmail },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { email: adminEmail, isSuperAdmin: true },
      });
    } else if (!user.isSuperAdmin) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { isSuperAdmin: true },
      });
    }

    const sessionToken = randomUUID();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: { sessionToken, userId: user.id, expires },
    });

    const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";
    const rootHostname = ROOT_DOMAIN.split(":")[0];
    const isSecure = request.url.startsWith("https://");
    const cookieName = isSecure
      ? "__Secure-authjs.session-token.super"
      : "authjs.session-token.super";

    const response = NextResponse.json({ success: true });

    response.cookies.set(cookieName, sessionToken, {
      expires,
      path: "/",
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      domain: isSecure ? `.${rootHostname}` : undefined,
    });

    return response;
  } catch (error) {
    console.error("Admin login error:", error);
    return NextResponse.json(
      { error: "Error al iniciar sesión" },
      { status: 500 },
    );
  }
}
