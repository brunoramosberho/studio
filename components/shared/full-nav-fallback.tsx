"use client";

import { useEffect } from "react";

/**
 * Signed-out public-site navigation fallback.
 *
 * On the public (signed-out) surface, Next's App Router client-side navigation
 * silently aborts: a <Link> click fires its handler and the RSC navigation
 * request returns a valid 200 flight, but the transition never commits — the
 * URL never changes, the destination never mounts, and nothing is logged
 * (window.onerror / console.error / unhandledrejection are all empty). The
 * wedged transition then blocks every following <Link> click, so the whole
 * public site feels frozen — only plain buttons (discipline tags, filters) keep
 * working, since they don't route. Full-page loads always succeed.
 *
 * We could not root-cause the internal router abort (it reproduces in a clean
 * incognito window on the latest deploy, signed-out only), so this catches
 * internal-link clicks in the capture phase and turns them into full-page
 * navigations, which always work. Mounted only when there is no session;
 * signed-in users keep instant client-side navigation.
 *
 * Guards keep it from hijacking anything it shouldn't: modified clicks
 * (cmd/ctrl/shift/alt — open-in-new-tab etc.), middle/right clicks, new-tab
 * (target) links, downloads, hash/anchor links, external URLs, and — crucially
 * — clicks on an interactive element nested inside a link (e.g. the discipline
 * pill inside a class card), which must run its own handler, not navigate.
 */
export function FullNavFallback() {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;

      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;

      // A button/input/etc. nested inside the link handles its own click
      // (e.g. the discipline pill inside a class card) — leave it alone.
      const interactive = target?.closest(
        'button,[role="button"],input,select,textarea,label,summary',
      );
      if (interactive && anchor.contains(interactive)) return;

      const href = anchor.getAttribute("href");
      if (
        !href ||
        !href.startsWith("/") || // internal absolute paths only
        href.startsWith("//") || // protocol-relative = external
        href.startsWith("/#") // same-page anchor
      )
        return;

      const tgt = anchor.getAttribute("target");
      if (tgt && tgt !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      e.preventDefault();
      e.stopPropagation();
      window.location.assign(href);
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
