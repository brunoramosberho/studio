"use client";

import { IdentityCard } from "./review/IdentityCard";
import { BrandCard } from "./review/BrandCard";
import { LocationsCard } from "./review/LocationsCard";
import { DisciplinesCard } from "./review/DisciplinesCard";
import { PackagesCard } from "./review/PackagesCard";
import { PendingBanner } from "./review/PendingBanner";
import type { ExtractedData } from "@/lib/onboarding/types";

interface Props {
  data: ExtractedData;
  slug: string;
  slugAvailable: boolean | null;
  onChange: (data: ExtractedData) => void;
  onSlugChange: (slug: string) => void;
}

export function ReviewStep({ data, slug, slugAvailable, onChange, onSlugChange }: Props) {
  return (
    <div className="space-y-6">
      {/* Sources summary */}
      <div className="flex flex-wrap gap-2 text-xs text-gray-400">
        {data.sources.websiteAnalyzed && (
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-600">Web analizada</span>
        )}
        {data.sources.brandbookAnalyzed && (
          <span className="rounded-full bg-purple-50 px-2.5 py-1 text-purple-600">Brandbook analizado</span>
        )}
        {data.sources.instagramAnalyzed && (
          <span className="rounded-full bg-pink-50 px-2.5 py-1 text-pink-600">
            Instagram ({data.sources.instagramScreenshotsCount} screenshots)
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <IdentityCard
            data={data.identity}
            slug={slug}
            onChange={(identity) => onChange({ ...data, identity })}
            onSlugChange={onSlugChange}
            slugAvailable={slugAvailable}
          />
          <BrandCard
            data={data.brand}
            onChange={(brand) => onChange({ ...data, brand })}
          />
        </div>
        <div className="space-y-6">
          <LocationsCard
            data={data.locations}
            onChange={(locations) => onChange({ ...data, locations })}
          />
          <DisciplinesCard
            data={data.disciplines}
            onChange={(disciplines) => onChange({ ...data, disciplines })}
          />
          <PackagesCard
            data={data.packages}
            currency={data.brand.currency}
            onChange={(packages) => onChange({ ...data, packages })}
          />
        </div>
      </div>

      <PendingBanner notes={data.manualRequired.notes} />
    </div>
  );
}
