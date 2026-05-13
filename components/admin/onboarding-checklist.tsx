"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Check, ChevronRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useBranding } from "@/components/branding-provider";
import { cn } from "@/lib/utils";
import type {
  ChecklistItem,
  ChecklistItemKey,
  OnboardingChecklistResponse,
} from "@/app/api/admin/onboarding-checklist/route";

const ITEM_LABEL_KEYS: Record<ChecklistItemKey, { label: string; description: string }> = {
  stripe: {
    label: "admin.onboardingHero.stripeLabel",
    description: "admin.onboardingHero.stripeDescription",
  },
  branding: {
    label: "admin.onboardingHero.brandingLabel",
    description: "admin.onboardingHero.brandingDescription",
  },
  studio: {
    label: "admin.onboardingHero.studioLabel",
    description: "admin.onboardingHero.studioDescription",
  },
  disciplines: {
    label: "admin.onboardingHero.disciplinesLabel",
    description: "admin.onboardingHero.disciplinesDescription",
  },
  coaches: {
    label: "admin.onboardingHero.coachesLabel",
    description: "admin.onboardingHero.coachesDescription",
  },
  packages: {
    label: "admin.onboardingHero.packagesLabel",
    description: "admin.onboardingHero.packagesDescription",
  },
  classes: {
    label: "admin.onboardingHero.classesLabel",
    description: "admin.onboardingHero.classesDescription",
  },
  members: {
    label: "admin.onboardingHero.membersLabel",
    description: "admin.onboardingHero.membersDescription",
  },
};

export function useOnboardingChecklist() {
  return useQuery<OnboardingChecklistResponse>({
    queryKey: ["admin-onboarding-checklist"],
    queryFn: async () => {
      const res = await fetch("/api/admin/onboarding-checklist");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });
}

/**
 * Hero onboarding card for a fresh studio. Replaces KPIs entirely when the
 * studio is not operational yet (no classes, no members). Once the studio
 * starts running, this component is hidden by the parent and the regular
 * dashboard takes over.
 */
export function OnboardingChecklistHero({
  data,
}: {
  data: OnboardingChecklistResponse;
}) {
  const t = useTranslations();
  const { studioName, colorAdmin } = useBranding();
  const { data: session } = useSession();
  const firstName = (session?.user?.name ?? "").split(" ")[0] || "Admin";

  const { completedCount, totalCount, items } = data;
  const pct = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-2xl bg-card shadow-[0_2px_20px_-4px_rgba(0,0,0,0.08)]"
    >
      <div
        className="h-1"
        style={{
          background: `linear-gradient(90deg, ${colorAdmin}, ${colorAdmin}88, ${colorAdmin}44)`,
        }}
      />
      <div className="p-6 sm:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" style={{ color: colorAdmin }} />
              <span
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: colorAdmin }}
              >
                {t("admin.onboardingHero.kicker")}
              </span>
            </div>
            <h2 className="mt-2 font-display text-2xl font-bold sm:text-3xl">
              {t("admin.onboardingHero.heroTitle", { studioName, firstName })}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {t("admin.onboardingHero.heroSubtitle")}
            </p>
          </div>
          <div className="hidden sm:block">
            <ProgressRing pct={pct} accentColor={colorAdmin} />
          </div>
        </div>

        <div className="sm:hidden mb-6">
          <ProgressBar pct={pct} accentColor={colorAdmin} />
          <p className="mt-1.5 text-xs text-muted">
            {t("admin.onboardingHero.progressLabel", {
              completed: completedCount,
              total: totalCount,
            })}
          </p>
        </div>

        <ul className="divide-y divide-border/50">
          {items.map((item) => (
            <ChecklistRow key={item.key} item={item} accentColor={colorAdmin} t={t} />
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

function ChecklistRow({
  item,
  accentColor,
  t,
}: {
  item: ChecklistItem;
  accentColor: string;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const labels = ITEM_LABEL_KEYS[item.key];
  const content = (
    <div className="flex items-start gap-3.5 py-3.5">
      <div
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors",
          item.completed
            ? "bg-emerald-500 text-white"
            : "border-2 border-border bg-background",
        )}
        style={
          item.completed
            ? undefined
            : { borderColor: `${accentColor}40` }
        }
      >
        {item.completed && <Check className="h-3 w-3" strokeWidth={3} />}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-[14px] font-medium leading-tight transition-colors",
            item.completed ? "text-muted line-through" : "text-foreground",
          )}
        >
          {t(labels.label)}
        </p>
        <p className="mt-0.5 text-xs text-muted/80 leading-snug">
          {t(labels.description)}
        </p>
      </div>
      {!item.completed && (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      )}
    </div>
  );

  if (item.completed) {
    return <li>{content}</li>;
  }

  return (
    <li>
      <Link href={item.href} className="group block rounded-md transition-colors hover:bg-surface/40">
        {content}
      </Link>
    </li>
  );
}

function ProgressRing({ pct, accentColor }: { pct: number; accentColor: string }) {
  const size = 64;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-border/40"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={accentColor}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[14px] font-bold tabular-nums">
        {pct}%
      </div>
    </div>
  );
}

function ProgressBar({ pct, accentColor }: { pct: number; accentColor: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-border/40">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: accentColor }}
      />
    </div>
  );
}
