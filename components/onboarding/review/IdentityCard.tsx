"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { ExtractedIdentity } from "@/lib/onboarding/types";
import { Fingerprint } from "lucide-react";

interface Props {
  data: ExtractedIdentity;
  slug: string;
  onChange: (data: ExtractedIdentity) => void;
  onSlugChange: (slug: string) => void;
  slugAvailable: boolean | null;
}

export function IdentityCard({ data, slug, onChange, onSlugChange, slugAvailable }: Props) {
  const set = <K extends keyof ExtractedIdentity>(key: K, value: ExtractedIdentity[K]) =>
    onChange({ ...data, [key]: value });

  return (
    <Card className="border border-gray-100">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Fingerprint className="h-4 w-4 text-indigo-500" />
          Identidad
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Nombre del estudio">
          <Input value={data.name} onChange={(e) => set("name", e.target.value)} />
        </Field>

        <Field label="Slug">
          <div className="flex items-center gap-2">
            <Input
              value={slug}
              onChange={(e) => onSlugChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              className="font-mono"
            />
            <span className="shrink-0 text-sm text-gray-400">.mgic.app</span>
          </div>
          {slugAvailable === false && (
            <p className="mt-1 text-xs text-red-500">Este slug ya está en uso</p>
          )}
          {slugAvailable === true && (
            <p className="mt-1 text-xs text-green-600">Disponible</p>
          )}
        </Field>

        <Field label="Tagline">
          <Input value={data.tagline || ""} onChange={(e) => set("tagline", e.target.value || null)} />
        </Field>

        <Field label="Slogan">
          <Input value={data.slogan || ""} onChange={(e) => set("slogan", e.target.value || null)} />
        </Field>

        <Field label="SEO Description">
          <Textarea
            value={data.seoDescription || ""}
            onChange={(e) => set("seoDescription", e.target.value || null)}
            rows={2}
          />
        </Field>

        <Field label="Hero Headline">
          <Input value={data.homeHeadline || ""} onChange={(e) => set("homeHeadline", e.target.value || null)} />
        </Field>

        <Field label="Website URL">
          <Input value={data.websiteUrl} onChange={(e) => set("websiteUrl", e.target.value)} type="url" />
        </Field>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs font-medium text-gray-500">{label}</Label>
      {children}
    </div>
  );
}
