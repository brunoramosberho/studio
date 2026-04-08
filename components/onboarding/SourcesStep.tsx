"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Globe, Upload, Instagram, X, FileText, Sparkles } from "lucide-react";

interface SourcesState {
  websiteUrl: string;
  brandbookFile: File | null;
  instagramFiles: File[];
}

interface Props {
  sources: SourcesState;
  onChange: (sources: SourcesState) => void;
  onAnalyze: () => void;
}

export function SourcesStep({ sources, onChange, onAnalyze }: Props) {
  const brandbookRef = useRef<HTMLInputElement>(null);
  const igRef = useRef<HTMLInputElement>(null);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Website URL */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-indigo-500" />
          <Label className="text-base font-semibold text-gray-900">Sitio web del estudio</Label>
        </div>
        <Input
          type="url"
          placeholder="https://revivespain.com"
          value={sources.websiteUrl}
          onChange={(e) => onChange({ ...sources, websiteUrl: e.target.value })}
          className="text-base"
        />
        <p className="text-xs text-gray-400">
          Se analizará la página principal y se intentarán encontrar precios, clases y más
        </p>
      </section>

      {/* Brandbook PDF */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-indigo-500" />
          <Label className="text-base font-semibold text-gray-900">Brandbook</Label>
          <span className="text-xs text-gray-400">(opcional)</span>
        </div>
        {sources.brandbookFile ? (
          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <FileText className="h-5 w-5 text-red-500" />
            <span className="flex-1 truncate text-sm text-gray-700">{sources.brandbookFile.name}</span>
            <span className="text-xs text-gray-400">
              {(sources.brandbookFile.size / 1024 / 1024).toFixed(1)} MB
            </span>
            <button
              onClick={() => onChange({ ...sources, brandbookFile: null })}
              className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => brandbookRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 px-4 py-6 text-sm text-gray-500 transition-colors hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-600"
          >
            <Upload className="h-4 w-4" />
            Subir PDF del brandbook
          </button>
        )}
        <input
          ref={brandbookRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0] || null;
            if (file && file.size > 10 * 1024 * 1024) {
              alert("El brandbook es demasiado grande. Máximo 10 MB.");
              e.target.value = "";
              return;
            }
            onChange({ ...sources, brandbookFile: file });
            e.target.value = "";
          }}
        />
      </section>

      {/* Instagram Screenshots */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Instagram className="h-5 w-5 text-indigo-500" />
          <Label className="text-base font-semibold text-gray-900">Screenshots de Instagram</Label>
          <span className="text-xs text-gray-400">(opcional, máx. 5)</span>
        </div>
        {sources.instagramFiles.length > 0 && (
          <div className="grid grid-cols-5 gap-2">
            {sources.instagramFiles.map((file, i) => (
              <div key={i} className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200">
                <img
                  src={URL.createObjectURL(file)}
                  alt={`Screenshot ${i + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  onClick={() =>
                    onChange({
                      ...sources,
                      instagramFiles: sources.instagramFiles.filter((_, j) => j !== i),
                    })
                  }
                  className="absolute right-1 top-1 rounded-full bg-black/50 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {sources.instagramFiles.length < 5 && (
          <button
            onClick={() => igRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 px-4 py-6 text-sm text-gray-500 transition-colors hover:border-pink-300 hover:bg-pink-50/50 hover:text-pink-600"
          >
            <Upload className="h-4 w-4" />
            Subir screenshots ({sources.instagramFiles.length}/5)
          </button>
        )}
        <input
          ref={igRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            const newFiles = Array.from(e.target.files || []);
            const combined = [...sources.instagramFiles, ...newFiles].slice(0, 5);
            onChange({ ...sources, instagramFiles: combined });
            e.target.value = "";
          }}
        />
      </section>

      {sources.instagramFiles.length > 0 && (
        <p className="text-xs text-gray-400">
          Las imágenes se comprimen automáticamente antes del análisis
        </p>
      )}

      {/* CTA */}
      <Button
        onClick={onAnalyze}
        disabled={!sources.websiteUrl.trim()}
        className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700"
        size="lg"
      >
        <Sparkles className="h-4 w-4" />
        Analizar con IA
      </Button>
    </div>
  );
}
