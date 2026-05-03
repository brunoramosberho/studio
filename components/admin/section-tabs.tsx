"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export interface SectionTab {
  href: string;
  labelKey: string;
  icon?: LucideIcon;
  match?: (pathname: string) => boolean;
}

interface SectionTabsProps {
  tabs: SectionTab[];
  ariaLabel?: string;
  className?: string;
}

export function SectionTabs({ tabs, ariaLabel, className }: SectionTabsProps) {
  const pathname = usePathname();
  const t = useTranslations("admin");

  if (tabs.length < 2) return null;

  return (
    <nav
      aria-label={ariaLabel ?? "Section tabs"}
      className={cn(
        "mb-6 flex gap-1 overflow-x-auto rounded-xl bg-surface p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.match
          ? tab.match(pathname)
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all sm:text-sm",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            {Icon ? <Icon className="h-4 w-4 shrink-0 opacity-80" /> : null}
            <span className="truncate">{t(tab.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
