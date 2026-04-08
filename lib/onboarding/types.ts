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

export interface ExtractedData {
  identity: ExtractedIdentity;
  brand: ExtractedBrand;
  locations: ExtractedLocation[];
  disciplines: ExtractedDiscipline[];
  packages: ExtractedPackage[];
  manualRequired: {
    rooms: true;
    schedule: true;
    notes: string;
  };
  sources: {
    websiteAnalyzed: boolean;
    brandbookAnalyzed: boolean;
    instagramAnalyzed: boolean;
    instagramScreenshotsCount: number;
  };
}
