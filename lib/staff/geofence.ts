import { prisma } from "@/lib/db";

const EARTH_RADIUS_METERS = 6_371_000;

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface StudioGeoCandidate {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
}

export interface NearestStudioResult {
  studio: StudioGeoCandidate;
  distanceMeters: number;
  withinRadius: boolean;
}

// Great-circle distance in meters via Haversine. Plenty accurate at the scale
// of a city block (rounding error < 0.5%) and avoids needing PostGIS.
export function haversineDistance(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Find the nearest studio whose configured geofence covers the given point.
// Returns the closest studio overall plus whether it's within radius so the
// caller can decide between "clock me in here" and "you're not at any studio".
export async function findNearestStudioForClockIn(
  tenantId: string,
  point: GeoPoint,
): Promise<NearestStudioResult | null> {
  const studios = await prisma.studio.findMany({
    where: {
      tenantId,
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      geofenceRadiusMeters: true,
    },
  });

  if (studios.length === 0) return null;

  let best: NearestStudioResult | null = null;
  for (const s of studios) {
    if (s.latitude == null || s.longitude == null) continue;
    const candidate: StudioGeoCandidate = {
      id: s.id,
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      geofenceRadiusMeters: s.geofenceRadiusMeters,
    };
    const distance = haversineDistance(point, {
      latitude: s.latitude,
      longitude: s.longitude,
    });
    const result: NearestStudioResult = {
      studio: candidate,
      distanceMeters: distance,
      withinRadius: distance <= s.geofenceRadiusMeters,
    };

    // Prefer the closest in-radius studio; fall back to the globally closest
    // so the caller can surface a helpful "you're 800m from Polanco" message.
    if (!best) {
      best = result;
    } else if (result.withinRadius && !best.withinRadius) {
      best = result;
    } else if (result.withinRadius === best.withinRadius && distance < best.distanceMeters) {
      best = result;
    }
  }

  return best;
}
