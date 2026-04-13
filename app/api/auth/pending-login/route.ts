import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";

function generateOtp(): string {
  const bytes = crypto.randomBytes(4);
  const num = (bytes.readUInt32BE() % 900000) + 100000;
  return num.toString();
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: "email required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Clean up expired pending logins
    await prisma.pendingLogin.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    // Delete any existing pending login for this email (user requested a new code)
    await prisma.pendingLogin.deleteMany({
      where: { email: normalizedEmail },
    });

    // Generate OTP with collision retry
    let otp = "";
    for (let i = 0; i < 5; i++) {
      otp = generateOtp();
      try {
        await prisma.pendingLogin.create({
          data: {
            email: normalizedEmail,
            token: otp,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          },
        });
        break;
      } catch (e: any) {
        if (e.code === "P2002" && i < 4) continue;
        throw e;
      }
    }

    // Send email with OTP code
    const { headers } = await import("next/headers");
    const { cookies } = await import("next/headers");
    const { getServerBranding } = await import("@/lib/branding.server");
    const { Resend } = await import("resend");
    const { getTranslations } = await import("next-intl/server");

    const b = await getServerBranding();
    const studioFull = `${b.studioName} Studio`;

    const cookieStore = await cookies();
    const locale = cookieStore.get("NEXT_LOCALE")?.value || "es";
    const t = await getTranslations({ locale, namespace: "email" });

    const resend = new Resend(process.env.RESEND_API_KEY!);
    const fromEmail = process.env.EMAIL_FROM || "hola@magicpay.mx";

    // Code formatted with a space for readability in notifications: "123 456"
    const codeFormatted = `${otp.slice(0, 3)} ${otp.slice(3)}`;

    await resend.emails.send({
      from: `${studioFull} <${fromEmail}>`,
      to: normalizedEmail,
      subject: `${otp} — ${t("otpSubject")}`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${b.colorBg};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${b.colorBg};padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;">
        <!-- Logo / Studio name -->
        <tr><td align="center" style="padding-bottom:32px;">
          ${b.logoUrl
            ? `<img src="${b.logoUrl}" alt="${b.studioName}" height="40" style="height:40px;" />`
            : `<span style="font-size:28px;font-weight:700;color:${b.colorFg};letter-spacing:-0.5px;">${b.studioName}</span>`}
        </td></tr>

        <!-- Card -->
        <tr><td>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;">
            <tr><td style="padding:40px 32px;text-align:center;">

              <p style="margin:0 0 8px;font-size:14px;color:${b.colorMuted};line-height:1.5;">
                ${t("otpIntro")}
              </p>

              <!-- OTP Code -->
              <div style="margin:24px 0;padding:20px 0;">
                <span style="font-family:'SF Mono','Roboto Mono','Fira Code',monospace;font-size:40px;font-weight:700;letter-spacing:12px;color:${b.colorFg};">${codeFormatted}</span>
              </div>

              <p style="margin:0 0 0;font-size:12px;color:${b.colorMuted};line-height:1.5;">
                ${t("otpExpiry")}
              </p>

              <hr style="border:none;border-top:1px solid #f0f0f0;margin:24px 0;" />

              <p style="margin:0;font-size:12px;color:${b.colorMuted};line-height:1.5;">
                ${t("ignoreEmail")}
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding-top:24px;">
          <p style="margin:0;font-size:11px;color:${b.colorMuted};opacity:0.7;">
            ${studioFull} &mdash; ${b.slogan}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/auth/pending-login error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const pending = await prisma.pendingLogin.findUnique({ where: { token } });

  if (!pending || pending.expiresAt < new Date()) {
    return NextResponse.json({ approved: false, expired: true });
  }

  if (pending.approved && pending.sessionToken) {
    await prisma.pendingLogin.delete({ where: { token } });
    return NextResponse.json({ approved: true, sessionToken: pending.sessionToken });
  }

  return NextResponse.json({ approved: false });
}
