"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface BrandedProps {
  /** Tenant accent color (brand color). */
  accent: string;
  /** Tenant hero background color (dark branded surface). */
  heroBg: string;
  /** Optional tenant icon URL. Falls back to the static /icon-192.png. */
  iconUrl?: string | null;
  /** Studio name used as accessible label for the logo. */
  studioName: string;
}

type SplashScreenProps = Partial<BrandedProps>;

/**
 * Full-screen splash shown while the app boots.
 *
 * When branding props (`accent`, `heroBg`) are provided — i.e. the user is in
 * the client portal — the splash paints a branded gradient from the very
 * first frame with the tenant's logo, so iOS/Android never show a flat
 * white/black screen. On admin/coach portals the splash falls back to the
 * neutral `--color-background` so those PWAs keep their original look.
 */
export function SplashScreen(props: SplashScreenProps) {
  const pathname = usePathname();
  const [fading, setFading] = useState(false);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFading(true);
        setTimeout(() => setRemoved(true), 500);
      });
    });
  }, []);

  if (removed || pathname === "/install" || pathname.startsWith("/embed")) {
    return null;
  }

  const branded = !!(props.accent && props.heroBg);

  if (branded) {
    const { accent, heroBg, iconUrl, studioName } = props as BrandedProps;
    // Prefer the tenant's CDN icon (no server round-trip). The static
    // /icon-192.png is bundled with the app shell and loads instantly.
    const logoSrc = iconUrl || "/icon-192.png";

    return (
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          // Layered gradient: a warm accent glow on top of a deep brand
          // surface. Using explicit brand colors (not CSS vars) guarantees
          // the splash never inherits `--color-background` (white/black).
          backgroundColor: heroBg,
          backgroundImage: `
            radial-gradient(ellipse 80% 60% at 50% 35%, ${accent}33 0%, transparent 60%),
            radial-gradient(ellipse 100% 80% at 50% 100%, ${accent}1f 0%, transparent 70%),
            linear-gradient(160deg, ${heroBg} 0%, color-mix(in srgb, ${heroBg} 85%, ${accent}) 100%)
          `,
          opacity: fading ? 0 : 1,
          transition: "opacity 0.45s ease-out",
          pointerEvents: "none",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoSrc}
          width={96}
          height={96}
          alt={studioName}
          loading="eager"
          decoding="sync"
          fetchPriority="high"
          style={{
            borderRadius: 24,
            boxShadow: "0 18px 48px rgba(0, 0, 0, 0.35)",
            animation: fading
              ? "none"
              : "splash-pulse 1.8s ease-in-out infinite",
            willChange: "transform, opacity",
          }}
        />
        <style>{`
          @keyframes splash-pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.88; transform: scale(0.96); }
          }
        `}</style>
      </div>
    );
  }

  // Unbranded fallback — admin/coach portals keep the original plain splash.
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        backgroundColor: "var(--color-background, #FAF9F6)",
        opacity: fading ? 0 : 1,
        transition: "opacity 0.4s ease-out",
        pointerEvents: "none",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/api/icon?size=192"
        width={72}
        height={72}
        alt=""
        style={{
          borderRadius: 18,
          animation: fading ? "none" : "splash-pulse 1.8s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes splash-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.85; transform: scale(0.97); }
        }
      `}</style>
    </div>
  );
}
