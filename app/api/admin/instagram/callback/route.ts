import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function graphFetch<T>(path: string, params: Record<string, string>) {
  const url = new URL(`https://graph.facebook.com/v20.0/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Graph error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function GET(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const { searchParams } = request.nextUrl;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.redirect(new URL("/admin/feed?ig=error", request.url));
    }
    if (!code || !state) {
      return NextResponse.redirect(new URL("/admin/feed?ig=missing", request.url));
    }

    const jar = await cookies();
    const expectedState = jar.get("ig_oauth_state")?.value ?? null;
    if (!expectedState || expectedState !== state) {
      return NextResponse.redirect(new URL("/admin/feed?ig=state", request.url));
    }
    jar.delete("ig_oauth_state");

    const appId = mustEnv("META_APP_ID");
    const appSecret = mustEnv("META_APP_SECRET");
    const redirectUri = mustEnv("META_IG_REDIRECT_URI");

    // Exchange code for user access token
    const token = await graphFetch<{
      access_token: string;
      token_type?: string;
      expires_in?: number;
    }>("oauth/access_token", {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });

    const accessToken = token.access_token;
    const expiresAt =
      typeof token.expires_in === "number"
        ? new Date(Date.now() + token.expires_in * 1000)
        : null;

    // Find first page with an attached Instagram Business Account
    const pages = await graphFetch<{ data: { id: string; name: string }[] }>("me/accounts", {
      access_token: accessToken,
    });

    let found: { pageId: string; igUserId: string; igUsername?: string | null } | null = null;
    for (const p of pages.data ?? []) {
      const page = await graphFetch<{
        instagram_business_account?: { id: string };
      }>(p.id, {
        fields: "instagram_business_account",
        access_token: accessToken,
      });
      const igUserId = page.instagram_business_account?.id;
      if (igUserId) {
        const ig = await graphFetch<{ username?: string }>(igUserId, {
          fields: "username",
          access_token: accessToken,
        });
        found = { pageId: p.id, igUserId, igUsername: ig.username ?? null };
        break;
      }
    }

    if (!found) {
      return NextResponse.redirect(new URL("/admin/feed?ig=no_business", request.url));
    }

    const prismaAny = prisma as any;
    await prismaAny.instagramIntegration?.upsert?.({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        pageId: found.pageId,
        igUserId: found.igUserId,
        igUsername: found.igUsername ?? null,
        accessToken,
        tokenType: token.token_type ?? null,
        expiresAt,
      },
      update: {
        pageId: found.pageId,
        igUserId: found.igUserId,
        igUsername: found.igUsername ?? null,
        accessToken,
        tokenType: token.token_type ?? null,
        expiresAt,
      },
    });

    return NextResponse.redirect(new URL("/admin/feed?ig=connected", request.url));
  } catch (error) {
    console.error("GET /api/admin/instagram/callback error:", error);
    return NextResponse.redirect(new URL("/admin/feed?ig=error", request.url));
  }
}

