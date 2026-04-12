export interface ExtractedIdentity {
  name: string;
  tagline: string | null;
  slogan: string | null;
  seoDescription: string | null;
  homeHeadline: string | null;
  websiteUrl: string;
}

export interface ExtractedBrand {
  primaryColor: string | null;
  accentColor: string | null;
  secondaryColors: string[];
  landingBgColor: string | null;
  logoUrl: string | null;
  currency: string;
}

export type Confidence = "high" | "medium" | "low";
export type Source = "website" | "instagram" | "both";

export interface ExtractedLocation {
  name: string;
  city: string | null;
  address: string | null;
  confidence: Confidence;
}

export interface ExtractedDiscipline {
  name: string;
  description: string | null;
  durationMinutes: number | null;
  level: "all" | "beginner" | "intermediate" | "advanced" | null;
  tags: string[];
  suggestedColor: string | null;
  suggestedIcon: string | null;
  source: Source;
  confidence: Confidence;
}

export interface ExtractedCoach {
  name: string;
  photoUrl: string | null;
  specialties: string[];
  source: Source;
  confidence: Confidence;
}

export interface ExtractedPackage {
  name: string;
  type: "offer" | "package" | "subscription";
  description: string | null;
  price: number | null;
  credits: number | null;
  unlimited: boolean;
  validityDays: number | null;
  periodicity: "monthly" | "annual" | null;
  confidence: Confidence;
}

export interface ExtractedScheduleSlot {
  dayOfWeek: number; // 1=Monday ... 7=Sunday (ISO)
  startTime: string; // "07:00" (HH:mm)
  disciplineName: string; // should match an extracted discipline name
  coachName: string | null; // should match an extracted coach name
  durationMinutes: number | null;
  confidence: Confidence;
}

export interface ExtractedData {
  identity: ExtractedIdentity;
  brand: ExtractedBrand;
  locations: ExtractedLocation[];
  disciplines: ExtractedDiscipline[];
  coaches: ExtractedCoach[];
  packages: ExtractedPackage[];
  schedule: ExtractedScheduleSlot[];
  manualRequired: {
    rooms: true;
    schedule: boolean;
    notes: string;
  };
  sources: {
    websiteAnalyzed: boolean;
    brandbookAnalyzed: boolean;
    instagramAnalyzed: boolean;
    instagramScreenshotsCount: number;
    scheduleScreenshotsAnalyzed: boolean;
    scheduleScreenshotsCount: number;
  };
}
