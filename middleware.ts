import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";

function getSubdomain(host: string): string | null {
  // Strip port for matching
  const hostname = host.split(":")[0];
  const rootHostname = ROOT_DOMAIN.split(":")[0];

  // e.g. betoro.reserva.fit → "betoro" | reserva.fit → null
  // e.g. betoro.localhost → "betoro" | localhost → null
  if (hostname === rootHostname) return null;
  if (hostname.endsWith(`.${rootHostname}`)) {
    return hostname.replace(`.${rootHostname}`, "");
  }

  return null;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host") || ROOT_DOMAIN;
  const subdomain = getSubdomain(host);

  // Super admin: admin.reserva.fit → rewrite to /super-admin/*
  if (subdomain === "admin") {
    const headers = new Headers(req.headers);
    headers.set("x-tenant-slug", "__super_admin__");

    const rewrittenPath = pathname === "/" ? "/super-admin" : `/super-admin${pathname}`;
    const url = req.nextUrl.clone();
    url.pathname = rewrittenPath;

    return NextResponse.rewrite(url, { request: { headers } });
  }

  // Inject tenant slug header for all requests
  const headers = new Headers(req.headers);
  if (subdomain) {
    headers.set("x-tenant-slug", subdomain);
  }

  // Skip auth check for API routes (handled inside each route)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next({ request: { headers } });
  }

  // Auth guard for protected areas
  const sessionToken =
    req.cookies.get("authjs.session-token")?.value ||
    req.cookies.get("__Secure-authjs.session-token")?.value;
  const isLoggedIn = !!sessionToken;

  if (
    pathname.startsWith("/my") ||
    pathname.startsWith("/coach") ||
    pathname.startsWith("/admin")
  ) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
