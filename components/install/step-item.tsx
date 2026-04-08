"use client";

export function StepItem({
  num,
  children,
  subtitle,
}: {
  num: number;
  children: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="border-b border-black/[0.07] py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        <span className="mt-px shrink-0 text-[15px] font-semibold text-[#1C1917]">
          {num}.
        </span>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-[15px] leading-relaxed text-[#1C1917]">
          {children}
        </div>
      </div>
      {subtitle && (
        <div className="ml-7 mt-1 text-[13px] text-[#888]">{subtitle}</div>
      )}
    </div>
  );
}

/* ─── Inline badge components ─── */

export function IconBadge({
  children,
  variant = "outline",
}: {
  children: React.ReactNode;
  variant?: "outline" | "filled";
}) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md px-1.5 py-0.5 align-middle ${
        variant === "filled"
          ? "bg-[#E8E8ED] text-[#1C1917]"
          : "border border-[#D1D1D6] bg-white text-[#1C1917]"
      }`}
    >
      {children}
    </span>
  );
}

export function ActionBadge({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-[#D1D1D6] bg-white px-2 py-0.5 align-middle text-[13px] font-medium text-[#1C1917]">
      {icon}
      {label}
    </span>
  );
}

/* ─── Reusable inline SVG icons ─── */

export function ShareIcon({ size = 14 }: { size?: number }) {
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
      className="shrink-0"
    >
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

export function PlusIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      className="shrink-0"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 14 }: { size?: number }) {
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
      className="shrink-0"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function DotsIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className="shrink-0"
    >
      <circle cx="5" cy="12" r="2.5" />
      <circle cx="12" cy="12" r="2.5" />
      <circle cx="19" cy="12" r="2.5" />
    </svg>
  );
}

export function ChevronRight() {
  return (
    <span className="text-[13px] text-[#C7C7CC]">&gt;</span>
  );
}
