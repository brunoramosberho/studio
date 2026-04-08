"use client";

import { Input } from "@/components/ui/input";

interface ColorPickerProps {
  value: string | null;
  onChange: (color: string) => void;
  label?: string;
}

export function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  const hex = value || "#000000";
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="h-9 w-9 shrink-0 rounded-lg border border-gray-200 shadow-sm transition-shadow hover:shadow-md"
        style={{ backgroundColor: hex }}
        onClick={() => {
          const input = document.createElement("input");
          input.type = "color";
          input.value = hex;
          input.addEventListener("input", (e) => {
            onChange((e.target as HTMLInputElement).value);
          });
          input.click();
        }}
        title={label || "Elegir color"}
      />
      <Input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#RRGGBB"
        className="h-9 w-28 font-mono text-sm"
        maxLength={7}
      />
    </div>
  );
}
