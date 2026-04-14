"use client";

import { forwardRef, useState, useRef, useEffect } from "react";
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumber,
  type CountryCode,
} from "libphonenumber-js";
import { isValidPhoneNumber } from "react-phone-number-input";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export { isValidPhoneNumber };

const POPULAR_COUNTRIES: CountryCode[] = ["ES", "MX", "US", "CO", "AR", "CL", "PE", "GB", "FR", "DE", "BR", "PT"];

function countryFlag(code: string) {
  return code
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

const COUNTRY_NAMES: Record<string, string> = {
  ES: "España", MX: "México", US: "Estados Unidos", CO: "Colombia", AR: "Argentina",
  CL: "Chile", PE: "Perú", GB: "Reino Unido", FR: "Francia", DE: "Alemania",
  BR: "Brasil", PT: "Portugal", IT: "Italia", EC: "Ecuador", VE: "Venezuela",
  UY: "Uruguay", PY: "Paraguay", BO: "Bolivia", CR: "Costa Rica", PA: "Panamá",
  GT: "Guatemala", HN: "Honduras", SV: "El Salvador", NI: "Nicaragua", DO: "Rep. Dominicana",
  CU: "Cuba", PR: "Puerto Rico", CA: "Canadá", AU: "Australia", JP: "Japón",
  CN: "China", KR: "Corea del Sur", IN: "India", RU: "Rusia", NL: "Países Bajos",
  BE: "Bélgica", CH: "Suiza", AT: "Austria", SE: "Suecia", NO: "Noruega",
  DK: "Dinamarca", FI: "Finlandia", IE: "Irlanda", PL: "Polonia", CZ: "Chequia",
};

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  defaultCountry?: CountryCode;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function PhoneInput({
  value,
  onChange,
  defaultCountry = "ES",
  placeholder,
  className,
  disabled,
}: PhoneInputProps) {
  const [country, setCountry] = useState<CountryCode>(defaultCountry);
  const [nationalNumber, setNationalNumber] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value) {
      try {
        const parsed = parsePhoneNumber(value);
        if (parsed) {
          setCountry(parsed.country || defaultCountry);
          setNationalNumber(parsed.nationalNumber);
          return;
        }
      } catch {}
      const code = `+${getCountryCallingCode(country)}`;
      if (value.startsWith(code)) {
        setNationalNumber(value.slice(code.length).trim());
      }
    }
  }, []);

  const callingCode = getCountryCallingCode(country);

  function handleNationalChange(raw: string) {
    const digits = raw.replace(/[^\d]/g, "");
    setNationalNumber(digits);
    if (digits) {
      onChange(`+${callingCode}${digits}`);
    } else {
      onChange("");
    }
  }

  function handleCountrySelect(c: CountryCode) {
    setCountry(c);
    setDropdownOpen(false);
    setSearch("");
    const newCode = getCountryCallingCode(c);
    if (nationalNumber) {
      onChange(`+${newCode}${nationalNumber}`);
    }
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  useEffect(() => {
    if (dropdownOpen) setTimeout(() => searchRef.current?.focus(), 50);
  }, [dropdownOpen]);

  const allCountries = getCountries();
  const sortedCountries = [
    ...POPULAR_COUNTRIES.filter((c) => allCountries.includes(c)),
    ...allCountries.filter((c) => !POPULAR_COUNTRIES.includes(c)).sort((a, b) => {
      const nameA = COUNTRY_NAMES[a] || a;
      const nameB = COUNTRY_NAMES[b] || b;
      return nameA.localeCompare(nameB);
    }),
  ];

  const filteredCountries = search
    ? sortedCountries.filter((c) => {
        const q = search.toLowerCase();
        const name = (COUNTRY_NAMES[c] || c).toLowerCase();
        const code = `+${getCountryCallingCode(c)}`;
        return name.includes(q) || c.toLowerCase().includes(q) || code.includes(q);
      })
    : sortedCountries;

  const popularEnd = POPULAR_COUNTRIES.filter((c) => allCountries.includes(c)).length;

  return (
    <div className={cn("relative", className)} ref={dropdownRef}>
      <div
        className={cn(
          "flex h-11 w-full items-center rounded-md border border-input-border bg-background shadow-sm transition-colors",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <button
          type="button"
          onClick={() => !disabled && setDropdownOpen(!dropdownOpen)}
          className="flex h-full shrink-0 items-center gap-1 border-r border-input-border px-2.5 text-sm transition-colors hover:bg-surface/60"
          disabled={disabled}
        >
          <span className="text-base leading-none">{countryFlag(country)}</span>
          <ChevronDown className="h-3 w-3 text-muted" />
          <span className="font-body text-[13px] font-medium text-foreground">
            +{callingCode}
          </span>
        </button>

        <input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          value={nationalNumber}
          onChange={(e) => handleNationalChange(e.target.value)}
          placeholder={placeholder || "Número de teléfono"}
          disabled={disabled}
          className="h-full min-w-0 flex-1 bg-transparent px-3 font-body text-base text-foreground outline-none placeholder:text-muted/60"
        />
      </div>

      {dropdownOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div className="border-b border-border/50 p-2">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar país..."
              className="w-full rounded-md border border-input-border bg-surface/50 px-2.5 py-1.5 text-[13px] text-foreground outline-none placeholder:text-muted/50 focus:border-ring"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filteredCountries.map((c, i) => (
              <div key={c}>
                {!search && i === popularEnd && (
                  <div className="border-t border-border/40 mx-2 my-1" />
                )}
                <button
                  type="button"
                  onClick={() => handleCountrySelect(c)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface/80",
                    c === country && "bg-accent/5 font-medium",
                  )}
                >
                  <span className="text-base leading-none">{countryFlag(c)}</span>
                  <span className="flex-1 truncate text-foreground">
                    {COUNTRY_NAMES[c] || c}
                  </span>
                  <span className="text-[12px] text-muted">
                    +{getCountryCallingCode(c)}
                  </span>
                </button>
              </div>
            ))}
            {filteredCountries.length === 0 && (
              <p className="px-3 py-4 text-center text-[13px] text-muted">
                No se encontró el país
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
