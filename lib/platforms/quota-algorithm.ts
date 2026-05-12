export interface QuotaSuggestion {
  classpass: number;
  wellhub: number;
  direct: number;
}

export function suggestQuota({
  capacity,
  directBooked,
  daysUntilClass,
  maxPlatformPct = 20,
}: {
  capacity: number;
  directBooked: number;
  daysUntilClass: number;
  maxPlatformPct?: number;
}): QuotaSuggestion {
  const occupancy = directBooked / capacity;
  const maxPlatformSpots = Math.floor((capacity * maxPlatformPct) / 100);

  let multiplier: number;
  if (daysUntilClass >= 14) {
    multiplier = 1.0;
  } else if (daysUntilClass >= 7) {
    multiplier = occupancy > 0.7 ? 0.15 : 0.6;
  } else if (daysUntilClass >= 2) {
    multiplier = occupancy > 0.6 ? 0.0 : 0.4;
  } else {
    multiplier = 0.0;
  }

  const totalPlatform = Math.min(
    Math.round(maxPlatformSpots * multiplier),
    capacity - directBooked,
  );

  const cp = Math.floor(totalPlatform / 2);
  const wh = totalPlatform - cp;

  return {
    classpass: cp,
    wellhub: wh,
    direct: capacity - cp - wh,
  };
}
