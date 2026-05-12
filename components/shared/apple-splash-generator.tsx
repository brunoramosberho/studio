"use client";

import { useEffect } from "react";

interface AppleSplashGeneratorProps {
  /** Icon URL for the splash. Same-origin recommended to avoid CORS. */
  iconUrl: string;
  /** Background color for the splash (CSS color string). */
  bgColor: string;
}

/**
 * Generates iOS PWA splash screens client-side using Canvas.
 *
 * Instead of serving pre-generated PNGs from the server (which iOS can
 * fail to fetch/cache silently), this uses the Canvas API to render the
 * splash at the device's exact resolution, converts it to a data URL,
 * and injects `<link rel="apple-touch-startup-image">` tags into the
 * `<head>`. The data URL is self-contained — iOS doesn't need to fetch
 * anything extra when the user taps "Add to Home Screen".
 *
 * Only runs on iOS devices. Uses simple orientation media queries that
 * match ALL devices (no device-specific width/height/pixel-ratio).
 *
 * Based on https://github.com/avadhesh18/iosPWASplash
 */
export function AppleSplashGenerator({
  iconUrl,
  bgColor,
}: AppleSplashGeneratorProps) {
  useEffect(() => {
    // Only generate on iOS/iPadOS — other platforms use the manifest.
    if (!/iPad|iPhone|iPod/.test(navigator.userAgent)) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = iconUrl;

    img.onload = () => {
      const pixelRatio = window.devicePixelRatio || 1;
      const sw = screen.width * pixelRatio;
      const sh = screen.height * pixelRatio;

      // Scale icon relative to the pixel-ratio (original lib formula).
      const iconW = img.width / (3 / pixelRatio);
      const iconH = img.height / (3 / pixelRatio);

      // iOS app icons use a ~22.37% corner radius ("squircle" feel).
      const cornerRadius = Math.min(iconW, iconH) * 0.2237;

      const drawRoundedIcon = (
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
      ) => {
        // Pass 1: cast a soft drop shadow from an opaque rounded rect.
        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
        ctx.shadowBlur = Math.round(iconW * 0.14);
        ctx.shadowOffsetY = Math.round(iconW * 0.05);
        ctx.fillStyle = "#000";
        ctx.beginPath();
        roundedRectPath(ctx, x, y, iconW, iconH, cornerRadius);
        ctx.fill();
        ctx.restore();

        // Pass 2: clip to the rounded rect and draw the icon on top so
        // the shadow remains visible but the corners are crisp.
        ctx.save();
        ctx.beginPath();
        roundedRectPath(ctx, x, y, iconW, iconH, cornerRadius);
        ctx.clip();
        ctx.drawImage(img, x, y, iconW, iconH);
        ctx.restore();
      };

      // --- Portrait ---
      const portrait = document.createElement("canvas");
      portrait.width = sw;
      portrait.height = sh;
      const pCtx = portrait.getContext("2d")!;
      pCtx.fillStyle = bgColor;
      pCtx.fillRect(0, 0, sw, sh);
      drawRoundedIcon(pCtx, (sw - iconW) / 2, (sh - iconH) / 2);

      // --- Landscape ---
      const landscape = document.createElement("canvas");
      landscape.width = sh;
      landscape.height = sw;
      const lCtx = landscape.getContext("2d")!;
      lCtx.fillStyle = bgColor;
      lCtx.fillRect(0, 0, sh, sw);
      drawRoundedIcon(lCtx, (sh - iconW) / 2, (sw - iconH) / 2);

      // Remove any server-side startup-image links so iOS doesn't
      // prefer a stale/failing one over our fresh data URLs.
      document
        .querySelectorAll('link[rel="apple-touch-startup-image"]')
        .forEach((el) => el.remove());

      // Inject the data-URL links.
      const addLink = (dataUrl: string, media: string) => {
        const link = document.createElement("link");
        link.rel = "apple-touch-startup-image";
        link.media = media;
        link.href = dataUrl;
        document.head.appendChild(link);
      };

      addLink(portrait.toDataURL("image/png"), "screen and (orientation: portrait)");
      addLink(landscape.toDataURL("image/png"), "screen and (orientation: landscape)");
    };
  }, [iconUrl, bgColor]);

  return null;
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
