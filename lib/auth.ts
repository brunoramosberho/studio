import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import Credentials from "next-auth/providers/credentials";
import crypto from "crypto";
import { prisma } from "./db";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";
const rootHostname = ROOT_DOMAIN.split(":")[0];
const isProduction = process.env.NODE_ENV === "production";

const providers: Provider[] = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

if (process.env.RESEND_API_KEY) {
  providers.push(
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM || "hola@magicpay.mx",
      async sendVerificationRequest({ identifier: email, url, provider }) {
        const { headers } = await import("next/headers");
        const { cookies } = await import("next/headers");
        const { getServerBranding } = await import("./branding.server");
        const { Resend: ResendClient } = await import("resend");
        const { getTranslations } = await import("next-intl/server");

        const h = await headers();
        const host = h.get("host") || process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";
        const protocol = host.includes("localhost") ? "http" : "https";

        const fixedUrl = new URL(url);
        fixedUrl.protocol = protocol;
        fixedUrl.host = host;
        const magicUrl = fixedUrl.toString();

        const b = await getServerBranding();
        const studioFull = `${b.studioName} Studio`;

        const cookieStore = await cookies();
        const locale = cookieStore.get("NEXT_LOCALE")?.value || "es";
        const t = await getTranslations({ locale, namespace: "email" });
        const ta = await getTranslations({ locale, namespace: "auth" });

        const resend = new ResendClient(process.env.RESEND_API_KEY!);
        await resend.emails.send({
          from: `${studioFull} <${provider.from}>`,
          to: email,
          subject: `${t("approveLogin")} — ${b.studioName}`,
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
              <!-- Icon -->
              <div style="width:56px;height:56px;margin:0 auto 20px;border-radius:50%;background:${b.colorAccent}15;display:flex;align-items:center;justify-content:center;">
                <span style="font-size:28px;line-height:56px;">&#9993;</span>
              </div>

              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${b.colorFg};">
                ${t("approveLogin")}
              </h1>
              <p style="margin:0 0 28px;font-size:14px;color:${b.colorMuted};line-height:1.5;">
                ${t("clickToLogin", { studioName: studioFull })}
              </p>

              <!-- CTA Button -->
              <a href="${magicUrl}" target="_blank" style="display:inline-block;background:${b.colorFg};color:${b.colorBg};text-decoration:none;font-size:15px;font-weight:600;padding:14px 40px;border-radius:50px;letter-spacing:0.3px;">
                ${ta("login")}
              </a>

              <p style="margin:24px 0 0;font-size:12px;color:${b.colorMuted};line-height:1.5;">
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
      },
    }),
  );
}

providers.push(
  Credentials({
    name: "Dev Login",
    credentials: {
      email: { label: "Email", type: "email" },
    },
    async authorize(credentials) {
      if (process.env.NODE_ENV === "production" && !process.env.ALLOW_DEV_LOGIN) return null;
      const email = credentials?.email as string;
      if (!email) return null;
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return null;
      return { id: user.id, name: user.name, email: user.email, image: user.image };
    },
  }),
);

// ── Shared config ──

const sessionCallback = {
  async session({ session, user }: { session: any; user: any }) {
    if (session.user) {
      session.user.id = user.id;
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { isSuperAdmin: true },
      });
      (session.user as unknown as Record<string, unknown>).isSuperAdmin =
        dbUser?.isSuperAdmin ?? false;
    }
    return session;
  },
};

const signInEvent = {
  async signIn({ user }: { user: any }) {
    if (!user?.email) return;
    try {
      const pending = await prisma.pendingLogin.findFirst({
        where: {
          email: user.email.toLowerCase(),
          approved: false,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });
      if (!pending) return;

      const sessionToken = crypto.randomUUID();
      const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await prisma.session.create({
        data: { sessionToken, userId: user.id!, expires },
      });

      await prisma.pendingLogin.update({
        where: { id: pending.id },
        data: { approved: true, sessionToken },
      });
    } catch (e) {
      console.error("Failed to approve pending login:", e);
    }
  },
};

function cookieOptions(domain: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: isProduction,
    domain: domain && isProduction ? `.${rootHostname}` : undefined,
  };
}

function makeCookies(suffix?: string) {
  const sfx = suffix ? `.${suffix}` : "";
  return {
    sessionToken: {
      name: isProduction ? `__Secure-authjs.session-token${sfx}` : `authjs.session-token${sfx}`,
      options: cookieOptions(true),
    },
    csrfToken: {
      name: isProduction ? `__Host-authjs.csrf-token${sfx}` : `authjs.csrf-token${sfx}`,
      options: cookieOptions(false),
    },
    callbackUrl: {
      name: isProduction ? `__Secure-authjs.callback-url${sfx}` : `authjs.callback-url${sfx}`,
      options: cookieOptions(true),
    },
  };
}

const shared = {
  trustHost: true,
  adapter: PrismaAdapter(prisma),
  providers,
  callbacks: sessionCallback,
  events: signInEvent,
  session: { strategy: "database" as const },
};

// ── Client auth (for /my, public pages, super-admin) ──

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...shared,
  pages: { signIn: "/login", verifyRequest: "/login?verify=true" },
  cookies: makeCookies(),
});

// ── Staff auth (for /admin, /coach) ──

export const {
  handlers: adminHandlers,
  auth: adminAuth,
  signIn: adminSignIn,
  signOut: adminSignOut,
} = NextAuth({
  ...shared,
  basePath: "/api/auth-admin",
  pages: { signIn: "/login?portal=admin", verifyRequest: "/login?portal=admin&verify=true" },
  cookies: makeCookies("admin"),
});

// Cookie name constants for client-side / middleware use
export const CLIENT_SESSION_COOKIE = makeCookies().sessionToken.name;
export const ADMIN_SESSION_COOKIE = makeCookies("admin").sessionToken.name;
export const SUPER_SESSION_COOKIE = makeCookies("super").sessionToken.name;
