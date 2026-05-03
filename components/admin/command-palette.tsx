"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  ArrowRight,
  CornerDownLeft,
  ChevronUp,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { hasPermission, type AdminPermission } from "@/lib/permissions";
import type { Role } from "@prisma/client";

export interface PaletteItem {
  id: string;
  labelKey: string;
  groupKey: string;
  icon: LucideIcon;
  href?: string;
  action?: () => void;
  keywordsKey?: string;
  permission?: AdminPermission;
  feature?: keyof TenantFlags;
}

export interface TenantFlags {
  highlights: boolean;
  noShows: boolean;
  shop: boolean;
  orders: boolean;
  onDemand: boolean;
  achievements: boolean;
  referrals: boolean;
  platforms: boolean;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PaletteItem[];
  role: Role;
  flags: TenantFlags | null;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function fuzzyScore(query: string, target: string): number {
  if (!query) return 1;
  const q = normalize(query);
  const t = normalize(target);
  if (t.includes(q)) {
    return t.startsWith(q) ? 100 : 50;
  }
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length ? 10 : 0;
}

export function CommandPalette({ open, onOpenChange, items, role, flags }: CommandPaletteProps) {
  const router = useRouter();
  const t = useTranslations("admin");
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const accessible = useMemo(
    () =>
      items.filter((item) => {
        if (item.permission && !hasPermission(role, item.permission)) return false;
        return true;
      }),
    [items, role],
  );

  const enrichedItems = useMemo(
    () =>
      accessible.map((item) => {
        const label = t(item.labelKey);
        const group = t(item.groupKey);
        const keywords = item.keywordsKey ? t(item.keywordsKey) : "";
        const featureOn = !item.feature || (flags ? flags[item.feature] : true);
        return { item, label, group, keywords, featureOn };
      }),
    [accessible, t, flags],
  );

  const ranked = useMemo(() => {
    const q = query.trim();
    const scored = enrichedItems.map((entry) => {
      const labelScore = fuzzyScore(q, entry.label);
      const groupScore = fuzzyScore(q, entry.group) * 0.3;
      const keywordsScore = entry.keywords ? fuzzyScore(q, entry.keywords) * 0.5 : 0;
      const baseScore = Math.max(labelScore, groupScore, keywordsScore);
      const score = entry.featureOn ? baseScore : baseScore * 0.5;
      return { ...entry, score };
    });
    const filtered = q
      ? scored.filter((s) => s.score > 0)
      : scored.filter((s) => s.featureOn);
    filtered.sort((a, b) => {
      if (a.featureOn !== b.featureOn) return a.featureOn ? -1 : 1;
      return b.score - a.score;
    });
    return filtered;
  }, [enrichedItems, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function runItem(item: PaletteItem) {
    onOpenChange(false);
    if (item.action) {
      item.action();
    } else if (item.href) {
      router.push(item.href);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, ranked.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = ranked[activeIndex];
      if (target) runItem(target.item);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
    }
  }

  // Group adjacent items by group
  const grouped: { group: string; items: typeof ranked }[] = [];
  ranked.forEach((entry) => {
    const last = grouped[grouped.length - 1];
    if (last && last.group === entry.group) {
      last.items.push(entry);
    } else {
      grouped.push({ group: entry.group, items: [entry] });
    }
  });

  let runningIndex = 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-foreground/30 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />
          <div className="fixed inset-0 z-[61] flex items-start justify-center p-4 pt-[10vh]">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -12 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-xl overflow-hidden rounded-xl border border-border/50 bg-card shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 border-b border-border/40 px-4">
                <Search className="h-4 w-4 shrink-0 text-muted" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder={t("commandPalette.placeholder")}
                  className="h-12 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted/60"
                />
                <kbd className="hidden rounded border border-border/40 px-1.5 py-0.5 text-[10px] font-medium text-muted sm:inline">
                  ESC
                </kbd>
              </div>

              <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
                {ranked.length === 0 ? (
                  <div className="px-6 py-10 text-center text-sm text-muted">
                    {t("commandPalette.empty")}
                  </div>
                ) : (
                  grouped.map((g) => (
                    <div key={g.group} className="py-1">
                      <div className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted/60">
                        {g.group}
                      </div>
                      {g.items.map((entry) => {
                        const idx = runningIndex++;
                        const Icon = entry.item.icon;
                        const active = idx === activeIndex;
                        return (
                          <button
                            key={entry.item.id}
                            data-index={idx}
                            type="button"
                            onMouseEnter={() => setActiveIndex(idx)}
                            onClick={() => runItem(entry.item)}
                            className={cn(
                              "flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] transition-colors",
                              active ? "bg-admin/8 text-admin" : "text-foreground/80 hover:bg-foreground/[0.04]",
                            )}
                          >
                            <Icon
                              className={cn(
                                "h-4 w-4 shrink-0",
                                active ? "text-admin" : "text-foreground/40",
                              )}
                              strokeWidth={active ? 2.25 : 1.75}
                            />
                            <span className="flex-1 truncate font-medium">{entry.label}</span>
                            {!entry.featureOn && (
                              <span className="rounded-sm border border-border/60 px-1.5 py-px text-[10px] font-medium text-muted">
                                {t("commandPalette.featureOff")}
                              </span>
                            )}
                            {active && (
                              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-admin/70" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center gap-4 border-t border-border/40 bg-surface/40 px-4 py-2 text-[11px] text-muted">
                <span className="flex items-center gap-1">
                  <ChevronUp className="h-3 w-3" />
                  <ChevronDown className="h-3 w-3" />
                  {t("commandPalette.navigate")}
                </span>
                <span className="flex items-center gap-1">
                  <CornerDownLeft className="h-3 w-3" />
                  {t("commandPalette.open")}
                </span>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
