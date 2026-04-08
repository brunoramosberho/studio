"use client";

import type { StudioBranding } from "@/lib/branding";

export function AppHeader({ brand }: { brand: StudioBranding }) {
  return (
    <div className="flex flex-col items-center px-6 pb-6 pt-10">
      {brand.appIconUrl ? (
        <img
          src={brand.appIconUrl}
          alt={brand.studioName}
          className="mb-3.5 h-20 w-20 rounded-[20px] object-cover"
          style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}
        />
      ) : (
        <div
          className="mb-3.5 flex h-20 w-20 items-center justify-center rounded-[20px]"
          style={{
            background: brand.colorAccent,
            boxShadow: `0 4px 16px ${brand.colorAccent}55`,
          }}
        >
          <span className="text-[28px] font-bold text-white">
            {brand.studioName.slice(0, 2).toUpperCase()}
          </span>
        </div>
      )}
      <div className="text-[22px] font-semibold text-[#1C1917]">
        {brand.studioName}
      </div>
      {brand.slogan && (
        <div className="mt-1 text-[13px] text-[#888]">{brand.slogan}</div>
      )}
    </div>
  );
}
