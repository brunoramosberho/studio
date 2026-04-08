"use client";

export function StepItem({
  num,
  color,
  title,
  subtitle,
  illustration,
}: {
  num: number;
  color: string;
  title: string;
  subtitle?: string;
  illustration?: React.ReactNode;
}) {
  return (
    <div className="border-b border-black/[0.07] py-2.5 last:border-b-0">
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
          style={{ background: color }}
        >
          {num}
        </div>
        <div>
          <div
            className="text-sm font-medium text-[#1C1917]"
            dangerouslySetInnerHTML={{ __html: title }}
          />
          {subtitle && (
            <div className="mt-0.5 text-xs text-[#888]">{subtitle}</div>
          )}
        </div>
      </div>
      {illustration && (
        <div className="ml-9 mt-2.5">{illustration}</div>
      )}
    </div>
  );
}
