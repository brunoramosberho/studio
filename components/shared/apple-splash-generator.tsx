"use client";

import { useEffect } from "react";

interface AppleSplashGeneratorProps {
  /** Icon URL for the splash. Same-origin recommended to avoid CORS. */
  iconUrl: string;
  /** Dark background color (used when system prefers dark). */
  darkBg: string;
  /** Light background color (used when system prefers light). */
  lightBg: string;
}

/**
 * Generates iOS PWA splash screens client-side using Canvas.
 *
 * Renders a polished splash: system-adaptive background (dark/light
 * based on prefers-color-scheme), the tenant icon with rounded corners
 * and a subtle shadow, centered on the canvas.
 *
 * Based on https://github.com/avadhesh18/iosPWASplash
 */
export function AppleSplashGenerator({
  iconUrl,
  darkBg,
  lightBg,
}: AppleSplashGeneratorProps) {
  useEffect(() => {
    if (!/iPad|iPhone|iPod/.test(navigator.userAgent)) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = iconUrl;

    img.onload = () => {
      const pixelRatio = window.devicePixelRatio || 1;
      const sw = screen.width * pixelRatio;
      const sh = screen.height * pixelRatio;

      const isDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      const bg = isDark ? darkBg : lightBg;

      const iconSize = Math.round(Math.min(sw, sh) * 0.28);
      const radius = Math.round(iconSize * 0.22);

      const drawSplash = (w: number, h: number): string => {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;

        // Background
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);

        const x = (w - iconSize) / 2;
        const y = (h - iconSize) / 2;

        // Shadow behind the icon
        ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
        ctx.shadowBlur = 40 * pixelRatio;
        ctx.shadowOffsetY = 12 * pixelRatio;

        // Rounded rect clip path
        ctx.beginPath();
        ctx.roundRect(x, y, iconSize, iconSize, radius);
        ctx.closePath();
        ctx.clip();

        // Draw icon inside the rounded clip
        ctx.drawImage(img, x, y, iconSize, iconSize);

        return canvas.toDataURL("image/png");
      };

      // Remove any server-side startup-image links.
      document
        .querySelectorAll('link[rel="apple-touch-startup-image"]')
        .forEach((el) => el.remove());

      const addLink = (dataUrl: string, media: string) => {
        const link = document.createElement("link");
        link.rel = "apple-touch-startup-image";
        link.media = media;
        link.href = dataUrl;
        document.head.appendChild(link);
      };

      addLink(drawSplash(sw, sh), "screen and (orientation: portrait)");
      addLink(drawSplash(sh, sw), "screen and (orientation: landscape)");
    };
  }, [iconUrl, darkBg, lightBg]);

  return null;
}
