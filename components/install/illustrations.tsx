"use client";

/* ─── Pulsing ring animation (shared) ─── */

function PulseRing({ color }: { color: string }) {
  return (
    <span
      className="absolute inset-0 animate-ping rounded-full opacity-30"
      style={{ background: color }}
    />
  );
}

function ShareIconSvg({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

/* ─── Safari bottom toolbar mockup ─── */

export function SafariBottomBar({ accentColor }: { accentColor: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-[#F9F9F9]">
      {/* Page content area */}
      <div className="flex h-10 items-end justify-center bg-white px-3 pb-1">
        <div className="h-1 w-16 rounded-full bg-black/[0.06]" />
      </div>

      {/* Bottom toolbar */}
      <div className="flex items-center justify-between border-t border-black/[0.08] bg-[#F7F7F7] px-3 py-2">
        {/* Back / Forward */}
        <div className="flex gap-4 text-[#007AFF]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </div>

        {/* Share button — highlighted */}
        <div className="relative flex items-center justify-center">
          <PulseRing color={accentColor} />
          <div
            className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-[#007AFF]"
            style={{ boxShadow: `0 0 0 2px ${accentColor}` }}
          >
            <ShareIconSvg size={15} />
          </div>
        </div>

        {/* Bookmark */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#007AFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" /></svg>

        {/* Tabs */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#007AFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><rect x="7" y="7" width="14" height="14" rx="2" /></svg>
      </div>
    </div>
  );
}

/* ─── Safari iOS 18+ bottom bar: ← tab URL reload ··· ─── */

function DotsIconSvg({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2.5" />
      <circle cx="12" cy="12" r="2.5" />
      <circle cx="19" cy="12" r="2.5" />
    </svg>
  );
}

export function SafariBottomBarModern({ accentColor, url }: { accentColor: string; url?: string }) {
  const displayUrl = url || (typeof window !== "undefined" ? window.location.hostname : "tu-estudio.mgic.app");
  return (
    <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-[#F9F9F9]">
      {/* Page content area */}
      <div className="flex h-10 items-end justify-center bg-white px-3 pb-1">
        <div className="h-1 w-16 rounded-full bg-black/[0.06]" />
      </div>

      {/* Bottom bar: ← tab URL reload ··· */}
      <div className="flex items-center gap-2 border-t border-black/[0.08] bg-[#F7F7F7] px-2.5 py-2">
        {/* Back */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#007AFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>

        {/* Tabs */}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#007AFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><rect x="7" y="7" width="14" height="14" rx="2" /></svg>

        {/* URL pill */}
        <div className="flex h-7 flex-1 items-center justify-center rounded-lg bg-white px-2">
          <span className="truncate text-[11px] text-[#8E8E93]">{displayUrl}</span>
        </div>

        {/* Reload */}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#007AFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" /></svg>

        {/* ··· highlighted */}
        <div className="relative flex items-center justify-center">
          <PulseRing color={accentColor} />
          <div
            className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-[#007AFF]"
            style={{ boxShadow: `0 0 0 2px ${accentColor}` }}
          >
            <DotsIconSvg size={14} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Safari / Chrome top URL bar mockup ─── */

export function BrowserTopBar({
  accentColor,
  browser = "safari",
  url,
}: {
  accentColor: string;
  browser?: "safari" | "chrome";
  url?: string;
}) {
  const displayUrl = url || (typeof window !== "undefined" ? window.location.hostname : "tu-estudio.mgic.app");
  const iconColor = browser === "safari" ? "#007AFF" : "#5F6368";

  return (
    <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-[#F9F9F9]">
      {/* URL bar area */}
      <div className="flex items-center gap-2 bg-[#F7F7F7] px-3 py-2">
        {browser === "chrome" && (
          <div className="flex h-5 w-5 shrink-0 items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5F6368" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </div>
        )}

        {/* URL pill */}
        <div className="flex h-8 flex-1 items-center justify-center rounded-lg bg-white px-3">
          <span className="truncate text-xs text-[#8E8E93]">
            {browser === "safari" && (
              <svg className="mr-1 inline-block" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" strokeWidth={2.5}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            )}
            {displayUrl}
          </span>
        </div>

        {/* Share button — highlighted */}
        <div className="relative flex items-center justify-center">
          <PulseRing color={accentColor} />
          <div
            className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full"
            style={{ color: iconColor, boxShadow: `0 0 0 2px ${accentColor}` }}
          >
            <ShareIconSvg size={14} />
          </div>
        </div>

        {browser === "chrome" && (
          <div className="flex h-5 w-5 shrink-0 items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5F6368" strokeWidth={2.5} strokeLinecap="round"><circle cx="12" cy="6" r="1" fill="#5F6368" /><circle cx="12" cy="12" r="1" fill="#5F6368" /><circle cx="12" cy="18" r="1" fill="#5F6368" /></svg>
          </div>
        )}
      </div>

      {/* Page content area */}
      <div className="flex h-10 flex-col items-center justify-center gap-1.5 bg-white px-4">
        <div className="h-1.5 w-full rounded-full bg-black/[0.04]" />
        <div className="h-1.5 w-3/4 rounded-full bg-black/[0.03]" />
      </div>
    </div>
  );
}

/* ─── Safari illustration: adapts to iOS version ─── */

export function SafariBarIllustration({
  accentColor,
  useDotsFlow,
}: {
  accentColor: string;
  useDotsFlow: boolean;
}) {
  if (useDotsFlow) {
    return <SafariBottomBarModern accentColor={accentColor} />;
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[#888]">
          Opción A — Barra inferior
        </p>
        <SafariBottomBar accentColor={accentColor} />
      </div>

      <div className="flex items-center gap-2 px-2">
        <div className="h-px flex-1 bg-black/[0.06]" />
        <span className="text-[10px] font-medium text-[#aaa]">O</span>
        <div className="h-px flex-1 bg-black/[0.06]" />
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[#888]">
          Opción B — Barra de dirección
        </p>
        <BrowserTopBar accentColor={accentColor} browser="safari" />
      </div>
    </div>
  );
}

/* ─── Share sheet mockup (iOS) ─── */

export function ShareSheetMockup({ accentColor }: { accentColor: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-white">
      {/* Drag handle */}
      <div className="flex justify-center pb-1 pt-2">
        <div className="h-1 w-9 rounded-full bg-black/[0.12]" />
      </div>

      {/* App row */}
      <div className="flex gap-3 overflow-hidden px-4 pb-3 pt-1">
        {["#E8E8E8", "#D4D4D4", "#E0E0E0", "#DCDCDC", "#E4E4E4"].map((bg, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="h-10 w-10 rounded-xl" style={{ background: bg }} />
            <div className="h-1 w-7 rounded-full bg-black/[0.06]" />
          </div>
        ))}
      </div>

      <div className="border-t border-black/[0.06]" />

      {/* Action list */}
      <div className="py-1">
        {["Copiar", "Añadir marcador"].map((label) => (
          <div key={label} className="flex items-center gap-3 px-4 py-2">
            <div className="h-5 w-5 rounded bg-black/[0.06]" />
            <span className="text-xs text-[#1C1917]">{label}</span>
          </div>
        ))}

        {/* Highlighted action */}
        <div
          className="mx-2 flex items-center gap-3 rounded-lg px-2 py-2"
          style={{ background: `${accentColor}12` }}
        >
          <div className="flex h-5 w-5 items-center justify-center rounded" style={{ background: accentColor }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </div>
          <span className="text-xs font-semibold" style={{ color: accentColor }}>
            Añadir a pantalla de inicio
          </span>
        </div>

        <div className="flex items-center gap-3 px-4 py-2">
          <div className="h-5 w-5 rounded bg-black/[0.06]" />
          <span className="text-xs text-[#1C1917]">Añadir a lista de lectura</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Chrome "Ver más" / share sheet mockup ─── */

export function ChromeShareSheetMockup({ accentColor }: { accentColor: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-white">
      <div className="flex justify-center pb-1 pt-2">
        <div className="h-1 w-9 rounded-full bg-black/[0.12]" />
      </div>

      <div className="py-1">
        {["Nueva pestaña", "Descargar"].map((label) => (
          <div key={label} className="flex items-center gap-3 px-4 py-2">
            <div className="h-5 w-5 rounded bg-black/[0.06]" />
            <span className="text-xs text-[#1C1917]">{label}</span>
          </div>
        ))}

        {/* Highlighted action */}
        <div
          className="mx-2 flex items-center gap-3 rounded-lg px-2 py-2"
          style={{ background: `${accentColor}12` }}
        >
          <div className="flex h-5 w-5 items-center justify-center rounded" style={{ background: accentColor }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </div>
          <span className="text-xs font-semibold" style={{ color: accentColor }}>
            Agregar a Inicio
          </span>
        </div>

        <div className="flex items-center gap-3 px-4 py-2">
          <div className="h-5 w-5 rounded bg-black/[0.06]" />
          <span className="text-xs text-[#1C1917]">Configuración</span>
        </div>
      </div>
    </div>
  );
}
