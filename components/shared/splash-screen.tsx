"use client";

import { useEffect, useState } from "react";

export function SplashScreen() {
  const [fading, setFading] = useState(false);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFading(true);
        setTimeout(() => setRemoved(true), 450);
      });
    });
  }, []);

  if (removed) return null;

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
