"use client";

import { Navigation } from "lucide-react";
import { useTranslations } from "next-intl";

interface StudioLocationMapProps {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

function getMapUrl(lat: number, lng: number) {
  const pin = `pin-s+ef4444(${lng},${lat})`;
  return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${pin}/${lng},${lat},15,0/400x200@2x?access_token=${MAPBOX_TOKEN}&logo=false&attribution=false`;
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

  if (!MAPBOX_TOKEN) return null;

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
          src={getMapUrl(latitude, longitude)}
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
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3.5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-80 active:opacity-70"
        >
          <Navigation className="h-3.5 w-3.5" />
          {t("directions")}
        </a>
      </div>
    </div>
  );
}
