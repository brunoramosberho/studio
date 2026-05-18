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
    // Never throw from here: if this callback rejects, @auth/core's session
    // handler returns an empty body, the client reads `unauthenticated`, and
    // the verify-before-redirect bounces the user to /login — even though
    // the cookie and DB session are valid. That manifested as "PWA pide
    // login en cada apertura" on iOS. Always return the session object;
    // degrade `isSuperAdmin` to false if the lookup fails.
    if (!session?.user) return session;
    session.user.id = user.id;
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { isSuperAdmin: true },
      });
      (session.user as unknown as Record<string, unknown>).isSuperAdmin =
        dbUser?.isSuperAdmin ?? false;
    } catch (e) {
      console.error(
        "[auth/sessionCallback] isSuperAdmin lookup failed, defaulting to false",
        e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      );
      (session.user as unknown as Record<string, unknown>).isSuperAdmin = false;
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

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

function cookieOptions(domain: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: isProduction,
    domain: domain && isProduction ? `.${rootHostname}` : undefined,
    // Explicit Max-Age in addition to NextAuth's `Expires`. iOS Safari /
    // standalone PWAs are more reliable about persisting cookies across
    // app relaunches when both attributes are present.
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

// The role tag goes BEFORE the cookie kind, never after. @auth/core's
// SessionStore reassembles "chunked" session cookies by collecting every
// cookie whose name `startsWith(sessionTokenCookieName)`. With the old
// suffix-after layout (`session-token` vs `session-token.admin`), the
// client instance picked up the admin cookie as a phantom chunk,
// concatenated both UUIDs, failed the DB lookup, and called
// sessionStore.clean() — which deletes EVERY chunk it collected. The
// result was: log in, both cookies set, refresh, server silently wipes
// both cookies, user bounces back to /login. By putting the tag in
// front (`session-token` vs `admin.session-token`) no name is a prefix
// of another, so each NextAuth instance only ever sees its own cookie.
function makeCookies(suffix?: string) {
  const tag = suffix ? `${suffix}.` : "";
  return {
    sessionToken: {
      name: isProduction
        ? `__Secure-authjs.${tag}session-token`
        : `authjs.${tag}session-token`,
      options: cookieOptions(true),
    },
    csrfToken: {
      name: isProduction
        ? `__Host-authjs.${tag}csrf-token`
        : `authjs.${tag}csrf-token`,
      options: cookieOptions(false),
    },
    callbackUrl: {
      name: isProduction
        ? `__Secure-authjs.${tag}callback-url`
        : `authjs.${tag}callback-url`,
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
  session: {
    strategy: "database" as const,
    // Match the cookie's Max-Age. NextAuth defaults to 30 days too, but
    // making it explicit avoids any drift between the cookie attribute
    // and the DB session's `expires` field.
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
};

// ── Client auth (for /my, public pages, super-admin) ──

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...shared,
  pages: { signIn: "/login", verifyRequest: "/login?verify=true" },
  // Tag the client cookie ("client.session-token") even though there is
  // no parallel instance to collide with — without a tag, any old
  // pre-rename `session-token.admin` / `session-token.super` cookie still
  // sitting in a browser would be picked up as a phantom chunk of the
  // client session (it `startsWith`es `session-token`). With the tag in
  // front, the client SessionStore matches only its own cookie.
  cookies: makeCookies("client"),
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
// Must mirror the `cookies:` passed into NextAuth() above. The client
// instance uses `makeCookies("client")`, so the exported constant must
// match — otherwise portal-sso / debug-cookie / etc. look up the wrong
// cookie name and the user looks logged-out from the server's POV.
export const CLIENT_SESSION_COOKIE = makeCookies("client").sessionToken.name;
export const ADMIN_SESSION_COOKIE = makeCookies("admin").sessionToken.name;
export const SUPER_SESSION_COOKIE = makeCookies("super").sessionToken.name;
