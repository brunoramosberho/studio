import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";

function getSubdomain(host: string): string | null {
  const hostname = host.split(":")[0];
  const rootHostname = ROOT_DOMAIN.split(":")[0];

  if (hostname === rootHostname) return null;
  if (hostname === `www.${rootHostname}`) return null;
  if (hostname.endsWith(`.${rootHostname}`)) {
    return hostname.replace(`.${rootHostname}`, "");
  }

  return null;
}

function isAdminPortalPath(pathname: string): boolean {
  return (
    pathname.startsWith("/admin") ||
    (pathname.startsWith("/coach") && !pathname.startsWith("/coaches")) ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/ai") ||
    pathname.startsWith("/api/check-in") ||
    pathname.startsWith("/api/platforms") ||
    pathname.startsWith("/api/coaches/availability") ||
    pathname.startsWith("/api/stripe/connect") ||
    pathname.startsWith("/api/stripe/subscription") ||
    pathname.startsWith("/api/stripe/billing-portal")
  );
}

function hasClientCookie(req: NextRequest): boolean {
  return !!(
    req.cookies.get("authjs.session-token")?.value ||
    req.cookies.get("__Secure-authjs.session-token")?.value
  );
}

function hasAdminCookie(req: NextRequest): boolean {
  return !!(
    req.cookies.get("authjs.session-token.admin")?.value ||
    req.cookies.get("__Secure-authjs.session-token.admin")?.value
  );
}

/** Paths that require a tenant subdomain. On the apex, they redirect home. */
function isTenantOnlyPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/my") ||
    pathname.startsWith("/admin") ||
    (pathname.startsWith("/coach") && !pathname.startsWith("/coaches")) ||
    pathname.startsWith("/schedule") ||
    pathname.startsWith("/book") ||
    pathname.startsWith("/class/") ||
    pathname.startsWith("/packages") ||
    pathname.startsWith("/shop") ||
    pathname.startsWith("/rate") ||
    pathname.startsWith("/waiver") ||
    pathname.startsWith("/install")
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host") || ROOT_DOMAIN;
  const subdomain = getSubdomain(host);

  // Super admin: admin.mgic.app → rewrite page routes to /super-admin/*
  if (subdomain === "admin") {
    const headers = new Headers(req.headers);
    headers.set("x-tenant-slug", "__super_admin__");
    headers.set("x-auth-portal", "client");

    if (pathname.startsWith("/api/") || pathname === "/login" || pathname === "/dev") {
      return NextResponse.next({ request: { headers } });
    }

    const rewrittenPath = pathname === "/" ? "/super-admin" : `/super-admin${pathname}`;
    const url = req.nextUrl.clone();
    url.pathname = rewrittenPath;

    return NextResponse.rewrite(url, { request: { headers } });
  }

  // Apex domain (no subdomain): serve the marketing landing. No auth, no PWA,
  // no tenant-specific surfaces — those live on [slug].mgic.app only.
  if (!subdomain) {
    if (pathname === "/") {
      const url = req.nextUrl.clone();
      url.pathname = "/directory";
      return NextResponse.rewrite(url);
    }

    // Block tenant-only routes on the apex. Send visitors to the landing.
    if (isTenantOnlyPath(pathname)) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  }

  // Inject tenant slug + auth portal + locale header
  const headers = new Headers(req.headers);
  headers.set("x-tenant-slug", subdomain);
  headers.set("x-auth-portal", isAdminPortalPath(pathname) ? "admin" : "client");

  // Locale: cookie override → default "es" (tenant locale resolved server-side in i18n/request.ts)
  const localeCookie = req.cookies.get("NEXT_LOCALE")?.value;
  headers.set("x-locale", localeCookie && (localeCookie === "en" || localeCookie === "es") ? localeCookie : "es");

  // Skip auth check for API routes (handled inside each route)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next({ request: { headers } });
  }

  // Auth guard: check the portal-specific cookie
  const needsAdminAuth =
    pathname.startsWith("/admin") ||
    (pathname.startsWith("/coach") && !pathname.startsWith("/coaches"));

  if (needsAdminAuth) {
    if (!hasAdminCookie(req)) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("portal", "admin");
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  } else if (pathname.startsWith("/my")) {
    if (!hasClientCookie(req)) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|\\.well-known/.*).*)",
  ],
};
