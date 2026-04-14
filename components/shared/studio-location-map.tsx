"use client";

import { Navigation } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "@/components/theme-provider";

interface StudioLocationMapProps {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

type MapStyle = "light-v11" | "dark-v11";

function getMapUrl(lat: number, lng: number, style: MapStyle) {
  // Pin stays red for both themes — it reads well on either palette.
  const pin = `pin-s+ef4444(${lng},${lat})`;
  return `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${pin}/${lng},${lat},15,0/400x200@2x?access_token=${MAPBOX_TOKEN}&logo=false&attribution=false`;
}

function getDirectionsUrl(lat: number, lng: number) {
  const isIOS =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);

  if (isIOS) {
    return `https://maps.apple.com/?daddr=${lat},${lng}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export function StudioLocationMap({
  name,
  address,
  latitude,
  longitude,
}: StudioLocationMapProps) {
  const t = useTranslations("map");
  const { resolvedTheme } = useTheme();

  if (!MAPBOX_TOKEN) return null;

  const mapStyle: MapStyle = resolvedTheme === "dark" ? "dark-v11" : "light-v11";
  const directionsUrl = getDirectionsUrl(latitude, longitude);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
      <a
        href={directionsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <img
          // `key` forces a reload when theme flips so the cached light-style
          // image doesn't linger after switching to dark.
          key={mapStyle}
          src={getMapUrl(latitude, longitude, mapStyle)}
          alt={t("mapOf", { name })}
          width={400}
          height={200}
          loading="lazy"
          className="h-[160px] w-full object-cover sm:h-[200px]"
        />
      </a>

      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          <p className="truncate text-xs text-muted">{address}</p>
        </div>
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3.5 py-2 text-xs font-semibold text-background transition-opacity hover:opacity-80 active:opacity-70"
        >
          <Navigation className="h-3.5 w-3.5" />
          {t("directions")}
        </a>
      </div>
    </div>
  );
}
