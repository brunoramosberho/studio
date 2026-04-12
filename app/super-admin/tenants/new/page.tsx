"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SourcesStep } from "@/components/onboarding/SourcesStep";
import { AnalyzingStep } from "@/components/onboarding/AnalyzingStep";
import { ReviewStep } from "@/components/onboarding/ReviewStep";
import { SuccessStep } from "@/components/onboarding/SuccessStep";
import type { ExtractedData } from "@/lib/onboarding/types";
import { ArrowLeft, Check } from "lucide-react";

type Step = 1 | 2 | 3 | 4;

interface OnboardingState {
  step: Step;
  sources: {
    websiteUrl: string;
    brandbookFile: File | null;
    instagramFiles: File[];
    scheduleFiles: File[];
    scheduleText: string;
  };
  analyzing: boolean;
  analyzeError: string | null;
  extracted: ExtractedData | null;
  edited: ExtractedData | null;
  slug: string;
  slugAvailable: boolean | null;
  creating: boolean;
  created: {
    studioId: string;
    slug: string;
    summary?: {
      classTypes: number;
      coaches: number;
      rooms: number;
      pastClasses: number;
      futureClasses: number;
      demoUsers: number;
      bookings: number;
      feedEvents: number;
    };
  } | null;
}

const STEP_LABELS = ["Fuentes", "Análisis", "Revisar", "Crear"];

const IMG_MAX_DIMENSION = 1200;
const IMG_QUALITY = 0.75;
const BRANDBOOK_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function compressImage(file: File): Promise<{ data: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > IMG_MAX_DIMENSION || height > IMG_MAX_DIMENSION) {
        const ratio = Math.min(IMG_MAX_DIMENSION / width, IMG_MAX_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", IMG_QUALITY);
      resolve({
        data: dataUrl.split(",")[1],
        mediaType: "image/jpeg",
      });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function NewTenantPage() {
  const router = useRouter();
  const slugCheckTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const [state, setState] = useState<OnboardingState>({
    step: 1,
    sources: { websiteUrl: "", brandbookFile: null, instagramFiles: [], scheduleFiles: [], scheduleText: "" },
    analyzing: false,
    analyzeError: null,
    extracted: null,
    edited: null,
    slug: "",
    slugAvailable: null,
    creating: false,
    created: null,
  });

  // ── Slug availability check (debounced) ──
  const checkSlug = useCallback((slug: string) => {
    if (slugCheckTimer.current) clearTimeout(slugCheckTimer.current);
    if (!slug) {
      setState((s) => ({ ...s, slugAvailable: null }));
      return;
    }
    slugCheckTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/super-admin/onboarding/check-slug?slug=${slug}`);
        const data = await res.json();
        setState((s) => (s.slug === slug ? { ...s, slugAvailable: data.available } : s));
      } catch {
        // ignore
      }
    }, 400);
  }, []);

  // ── Step 1 → 2: Analyze ──
  const startAnalysis = useCallback(async () => {
    setState((s) => ({ ...s, step: 2, analyzing: true, analyzeError: null }));

    // Encode files: compress images, validate brandbook size
    let brandbookBase64: string | null = null;
    if (state.sources.brandbookFile) {
      if (state.sources.brandbookFile.size > BRANDBOOK_MAX_BYTES) {
        setState((s) => ({
          ...s,
          step: 1,
          analyzing: false,
          analyzeError: `El brandbook es demasiado grande (${(state.sources.brandbookFile!.size / 1024 / 1024).toFixed(1)} MB). Máximo 10 MB.`,
        }));
        return;
      }
      brandbookBase64 = await fileToBase64(state.sources.brandbookFile);
    }

    const instagramScreenshots: { data: string; mediaType: string }[] = [];
    for (const file of state.sources.instagramFiles) {
      instagramScreenshots.push(await compressImage(file));
    }

    const scheduleScreenshots: { data: string; mediaType: string }[] = [];
    for (const file of state.sources.scheduleFiles) {
      scheduleScreenshots.push(await compressImage(file));
    }

    try {
      const res = await fetch("/api/super-admin/onboarding/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteUrl: state.sources.websiteUrl,
          brandbookBase64,
          instagramScreenshots,
          scheduleScreenshots,
          scheduleText: state.sources.scheduleText || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error desconocido" }));
        setState((s) => ({
          ...s,
          analyzing: false,
          analyzeError: err.error || `Error ${res.status}`,
        }));
        return;
      }

      const extracted: ExtractedData = await res.json();
      const generatedSlug = slugify(extracted.identity.name);

      setState((s) => ({
        ...s,
        step: 3,
        analyzing: false,
        extracted,
        edited: structuredClone(extracted),
        slug: generatedSlug,
        slugAvailable: null,
      }));

      checkSlug(generatedSlug);
    } catch {
      setState((s) => ({
        ...s,
        analyzing: false,
        analyzeError: "Error de conexión. Verifica tu internet e intenta de nuevo.",
      }));
    }
  }, [state.sources, checkSlug]);

  // ── Step 3 → 4: Create tenant ──
  const createTenant = useCallback(async () => {
    if (!state.edited || !state.slug) return;
    setState((s) => ({ ...s, step: 4, creating: true }));

    try {
      const res = await fetch("/api/super-admin/onboarding/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...state.edited, slug: state.slug }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error" }));
        setState((s) => ({
          ...s,
          step: 3,
          creating: false,
          analyzeError: err.error,
        }));
        return;
      }

      const result = await res.json();
      setState((s) => ({
        ...s,
        creating: false,
        created: { studioId: result.studioId, slug: result.slug || state.slug, summary: result.summary },
      }));
    } catch {
      setState((s) => ({
        ...s,
        step: 3,
        creating: false,
        analyzeError: "Error al crear el tenant.",
      }));
    }
  }, [state.edited, state.slug]);

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center gap-4">
        <button
          onClick={() => router.push("/tenants")}
          className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Nuevo Tenant</h1>
          <p className="text-sm text-gray-500">Análisis con IA para crear un tenant completo</p>
        </div>
      </div>

      {/* Stepper */}
      <div className="mb-8 flex items-center gap-2">
        {STEP_LABELS.map((label, i) => {
          const stepNum = (i + 1) as Step;
          const isActive = state.step === stepNum;
          const isDone = state.step > stepNum;
          return (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && (
                <div className={`h-px w-8 ${isDone ? "bg-indigo-400" : "bg-gray-200"}`} />
              )}
              <div className="flex items-center gap-1.5">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    isDone
                      ? "bg-indigo-600 text-white"
                      : isActive
                        ? "bg-indigo-100 text-indigo-700 ring-2 ring-indigo-600"
                        : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" /> : stepNum}
                </div>
                <span
                  className={`hidden text-sm font-medium sm:inline ${
                    isActive ? "text-indigo-700" : isDone ? "text-gray-700" : "text-gray-400"
                  }`}
                >
                  {label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Step content */}
      {state.step === 1 && (
        <SourcesStep
          sources={state.sources}
          onChange={(sources) => setState((s) => ({ ...s, sources }))}
          onAnalyze={startAnalysis}
        />
      )}

      {state.step === 2 && (
        <AnalyzingStep
          websiteUrl={state.sources.websiteUrl}
          hasBrandbook={!!state.sources.brandbookFile}
          hasInstagram={state.sources.instagramFiles.length > 0}
          hasSchedule={state.sources.scheduleFiles.length > 0 || !!state.sources.scheduleText.trim()}
          error={state.analyzeError}
          onRetry={() => setState((s) => ({ ...s, step: 1 }))}
        />
      )}

      {state.step === 3 && state.edited && (
        <>
          <ReviewStep
            data={state.edited}
            slug={state.slug}
            slugAvailable={state.slugAvailable}
            onChange={(edited) => setState((s) => ({ ...s, edited }))}
            onSlugChange={(slug) => {
              setState((s) => ({ ...s, slug, slugAvailable: null }));
              checkSlug(slug);
            }}
          />
          <div className="mt-8 flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setState((s) => ({ ...s, step: 1 }))}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver a fuentes
            </Button>
            <Button
              onClick={createTenant}
              disabled={state.creating || !state.slug || state.slugAvailable === false}
              className="gap-2 bg-indigo-600 hover:bg-indigo-700"
              size="lg"
            >
              {state.creating ? "Creando..." : "Crear Tenant"}
            </Button>
          </div>
        </>
      )}

      {state.step === 4 && state.created && (
        <SuccessStep
          studioName={state.edited?.identity.name || ""}
          slug={state.created.slug}
          studioId={state.created.studioId}
          summary={state.created.summary}
        />
      )}

      {state.step === 4 && state.creating && (
        <div className="mx-auto max-w-md text-center">
          <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 p-8">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            <h3 className="mt-4 text-lg font-semibold text-gray-900">
              Creando tenant {state.edited?.identity.name}...
            </h3>
          </div>
        </div>
      )}
    </div>
  );
}
