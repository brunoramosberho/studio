"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function resolveEntity(pathname: string, searchParams: URLSearchParams) {
  // /class/[id] → class-instance
  const classMatch = pathname.match(/^\/class\/([^/]+)$/);
  if (classMatch) return { entityType: "class-instance", entityId: classMatch[1] };

  // /schedule?discipline=X → discipline link
  const discipline = searchParams.get("discipline");
  if (pathname === "/schedule" && discipline) return { entityType: "class", entityId: discipline };

  // /schedule (no discipline) → general schedule
  if (pathname === "/schedule") return { entityType: "schedule", entityId: "schedule" };

  // /packages/[id] → specific package
  const pkgMatch = pathname.match(/^\/packages\/([^/]+)$/);
  if (pkgMatch) return { entityType: "membership", entityId: pkgMatch[1] };

  // /packages → general packages page
  if (pathname === "/packages") return { entityType: "membership", entityId: "packages" };

  // /shop → shop
  if (pathname === "/shop") return { entityType: "product", entityId: "shop" };

  return null;
}

export function UtmTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const utmSource = searchParams.get("utm_source");
    const utmMedium = searchParams.get("utm_medium");
    const utmCampaign = searchParams.get("utm_campaign");

    if (!utmSource && !utmMedium && !utmCampaign) return;

    const entity = resolveEntity(pathname, searchParams);
    if (!entity) return;

    const dedupeKey = `_mgic_click_${entity.entityType}_${entity.entityId}`;
    if (sessionStorage.getItem(dedupeKey)) return;
    sessionStorage.setItem(dedupeKey, "1");

    fetch("/api/marketing/track/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: entity.entityType,
        entityId: entity.entityId,
        utmSource: utmSource || undefined,
        utmMedium: utmMedium || undefined,
        utmCampaign: utmCampaign || undefined,
        utmContent: searchParams.get("utm_content") || undefined,
        utmTerm: searchParams.get("utm_term") || undefined,
        referrer: document.referrer || undefined,
      }),
    }).catch(() => {});
  }, [pathname, searchParams]);

  // Member share link (?ref=CODE): record the click server-side (which also
  // sets the 30-day attribution cookie) and mirror the code to localStorage so
  // the existing signup-referral flow works from ANY page, not just /install.
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (!ref) return;

    try {
      const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
      localStorage.setItem("referral_code", ref);
      localStorage.setItem("referral_expiry", expiry.toString());
    } catch {}

    const dedupeKey = `_mgic_share_${ref}`;
    if (sessionStorage.getItem(dedupeKey)) return;
    sessionStorage.setItem(dedupeKey, "1");

    fetch("/api/share/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: ref, path: pathname }),
    }).catch(() => {});
  }, [pathname, searchParams]);

  return null;
}
