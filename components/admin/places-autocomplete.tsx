"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { MapPin, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PlaceResult {
  address: string;
  latitude: number;
  longitude: number;
}

interface PlacesAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: PlaceResult) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
}

interface Suggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
  fullText: string;
}

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

let loadPromise: Promise<void> | null = null;

function loadGoogleMaps(): Promise<void> {
  if ((window as unknown as Record<string, any>).google?.maps?.places?.Place) {
    return Promise.resolve();
  }
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places&loading=async&language=es`;
    script.async = true;
    script.onload = () => {
      const check = () => {
        if ((window as unknown as Record<string, any>).google?.maps?.places?.Place) {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    };
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return loadPromise;
}

export function PlacesAutocomplete({
  value,
  onChange,
  onSelect,
  onClear,
  placeholder = "Buscar dirección...",
  className,
}: PlacesAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sessionTokenRef = useRef<any>(null);

  useEffect(() => {
    if (!API_KEY) return;
    loadGoogleMaps().then(() => setReady(true)).catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchSuggestions = useCallback(
    async (input: string) => {
      if (!ready || !input.trim() || input.length < 3) {
        setSuggestions([]);
        return;
      }

      const google = (window as unknown as Record<string, any>).google;

      if (!sessionTokenRef.current) {
        sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
      }

      setLoading(true);
      try {
        const request = {
          input,
          sessionToken: sessionTokenRef.current,
          includedPrimaryTypes: ["street_address", "subpremise", "premise", "route"],
          language: "es",
        };

        const { suggestions: results } = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);

        const mapped: Suggestion[] = results
          .filter((s: any) => s.placePrediction)
          .slice(0, 5)
          .map((s: any) => {
            const pred = s.placePrediction;
            return {
              placeId: pred.placeId,
              mainText: pred.mainText?.text || pred.text?.text || "",
              secondaryText: pred.secondaryText?.text || "",
              fullText: pred.text?.text || "",
            };
          });

        setSuggestions(mapped);
        setOpen(mapped.length > 0);
      } catch (err) {
        console.error("Places autocomplete error:", err);
        setSuggestions([]);
      }
      setLoading(false);
    },
    [ready],
  );

  function handleInputChange(val: string) {
    onChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
  }

  async function handleSelect(suggestion: Suggestion) {
    setOpen(false);
    setSuggestions([]);
    onChange(suggestion.fullText);

    const google = (window as unknown as Record<string, any>).google;

    try {
      const place = new google.maps.places.Place({
        id: suggestion.placeId,
      });

      await place.fetchFields({
        fields: ["location", "formattedAddress"],
        sessionToken: sessionTokenRef.current,
      });

      sessionTokenRef.current = null;

      const lat = place.location?.lat();
      const lng = place.location?.lng();
      const addr = place.formattedAddress || suggestion.fullText;

      onChange(addr);
      if (lat != null && lng != null) {
        onSelect({ address: addr, latitude: lat, longitude: lng });
      }
    } catch (err) {
      console.error("Place details error:", err);
    }
  }

  if (!API_KEY) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "flex h-9 w-full rounded-md border border-border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          className,
        )}
      />
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className={cn(
            "flex h-9 w-full rounded-md border border-border bg-transparent pl-8 pr-8 py-1 text-sm shadow-sm transition-colors placeholder:text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            className,
          )}
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted" />
        )}
        {!loading && value && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              onClear?.();
              setSuggestions([]);
              inputRef.current?.focus();
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border/50 bg-white shadow-lg">
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              onClick={() => handleSelect(s)}
              className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface"
            >
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{s.mainText}</p>
                <p className="truncate text-xs text-muted">{s.secondaryText}</p>
              </div>
            </button>
          ))}
          <div className="border-t border-border/30 px-3 py-1.5">
            <p className="text-[10px] text-muted/50">Powered by Google</p>
          </div>
        </div>
      )}
    </div>
  );
}
