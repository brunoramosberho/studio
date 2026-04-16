"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface SplashScreenProps {
  /** Tenant accent color (brand color). */
  accent: string;
  /** Tenant hero background color (dark branded surface). */
  heroBg: string;
  /** Optional tenant icon URL. Falls back to the static /icon-192.png. */
  iconUrl?: string | null;
  /** Studio name used as accessible label for the logo. */
  studioName: string;
}

/**
 * Full-screen splash shown while the app boots. Designed so the user never
 * sees a flat white or black screen:
 *   - A branded gradient (accent + hero bg) paints instantly.
 *   - The logo is rendered eagerly with high fetch priority so it appears
 *     from the very first frame — no waiting for `/api/icon`.
 *   - The whole overlay fades out once React has mounted.
 *
 * The same background color is used for the manifest's `background_color`,
 * so the transition from the OS native splash to the web splash is seamless.
 */
export function SplashScreen({
  accent,
  heroBg,
  iconUrl,
  studioName,
}: SplashScreenProps) {
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
        // Layered gradient: a warm accent glow on top of a deep brand surface.
        // Using explicit brand colors (not CSS vars) guarantees the splash
        // never inherits the bare `--color-background` (white/black).
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
