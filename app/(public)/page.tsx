"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useBranding } from "@/components/branding-provider";
import {
  ArrowRight,
  Clock,
  Dumbbell,
  Star,
  CheckCircle2,
  CalendarCheck,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { getIconComponent } from "@/components/admin/icon-picker";
import { useTranslations } from "next-intl";

interface ClassTypeData {
  id: string;
  name: string;
  description: string | null;
  duration: number;
  level: string;
  color: string;
  icon: string | null;
}

// LEVEL_LABELS and steps defined inside component to access translations

interface CoachData {
  id: string;
  bio: string | null;
  specialties: string[];
  photoUrl: string | null;
  name: string;
  user?: { name?: string | null; image?: string | null } | null;
}

interface PackageData {
  id: string;
  name: string;
  description: string | null;
  type: string;
  credits: number | null;
  validDays: number;
  price: number;
  currency: string;
  isPromo: boolean;
  sortOrder: number;
}

function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" as const, delay: i * 0.12 },
  }),
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
};

export default function LandingPage() {
  const t = useTranslations("public");
  const LEVEL_LABELS: Record<string, string> = {
    ALL: t("allLevels"),
    BEGINNER: t("beginner"),
    INTERMEDIATE: t("intermediate"),
    ADVANCED: t("advanced"),
  };
  const steps = [
    {
      number: "01",
      title: t("step1Title"),
      description: t("step1Desc"),
    },
    {
      number: "02",
      title: t("step2Title"),
      description: t("step2Desc"),
    },
    {
      number: "03",
      title: t("step3Title"),
      description: t("step3Desc"),
    },
  ];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [coaches, setCoaches] = useState<CoachData[]>([]);
  const [packages, setPackages] = useState<PackageData[]>([]);
  const [classTypes, setClassTypes] = useState<ClassTypeData[]>([]);
  const branding = useBranding();

  const heroLight = isLightColor(branding.colorHeroBg || "#1C1917");
  const heroText = heroLight ? branding.colorFg : "#FFFFFF";
  const heroTextMuted = heroLight ? `${branding.colorFg}99` : "rgba(255,255,255,0.6)";
  const heroTextSubtle = heroLight ? `${branding.colorFg}50` : "rgba(255,255,255,0.3)";
  const heroBorder = heroLight ? `${branding.colorFg}20` : "rgba(255,255,255,0.2)";

  useEffect(() => {
    fetch("/api/coaches")
      .then((r) => r.json())
      .then((data) => setCoaches(Array.isArray(data) ? data : []))
      .catch(() => {});
    fetch("/api/packages")
      .then((r) => r.json())
      .then((data) => setPackages(Array.isArray(data) ? data : []))
      .catch(() => {});
    fetch("/api/class-types")
      .then((r) => r.json())
      .then((data) => setClassTypes(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  return (
    <div className="overflow-x-hidden">
      {/* ── Hero ──────────────────────────────────────────────── */}
      <section
        className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4"
        style={{ backgroundColor: branding.colorHeroBg }}
      >
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(ellipse at top right, ${branding.colorAccent}1F 0%, transparent 50%)` }}
        />
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(ellipse at bottom left, ${branding.colorAccent}0F 0%, transparent 50%)` }}
        />

        <motion.div
          className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 1.5, delay: 0.8, ease: "easeOut" as const }}
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${branding.colorAccent} 50%, transparent 100%)`,
          }}
        />

        <div className="relative z-10 mx-auto max-w-5xl text-center">
          <motion.div initial="hidden" animate="visible" variants={stagger}>
            <motion.p
              variants={fadeUp}
              custom={0}
              className="mb-8 text-sm font-medium uppercase tracking-[0.3em] text-accent"
            >
              {branding.tagline} Studio
            </motion.p>

            <motion.h1
              variants={fadeUp}
              custom={1}
              className="font-display text-6xl font-bold leading-[0.95] tracking-tight sm:text-8xl"
              style={{ color: heroText }}
            >
              {branding.slogan.split(".").filter(Boolean).map((part, i, arr) =>
                i === arr.length - 1 ? (
                  <span
                    key={i}
                    style={{
                      color: branding.colorAccent,
                      textShadow: heroLight ? "none" : `0 0 40px ${branding.colorAccent}88, 0 0 80px ${branding.colorAccent}44`,
                    }}
                  >
                    {part.trim()}.
                  </span>
                ) : (
                  <span key={i}>{part.trim()}.<br /></span>
                ),
              )}
            </motion.h1>

            <motion.p
              variants={fadeUp}
              custom={2}
              className="mx-auto mt-8 max-w-lg text-lg leading-relaxed sm:text-xl"
              style={{ color: heroTextMuted }}
            >
              {branding.metaDescription}
            </motion.p>

            <motion.div
              variants={fadeUp}
              custom={3}
              className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
            >
              <Button asChild size="lg" className="px-10 text-base">
                <Link href="/schedule">{t("bookYourClass")}</Link>
              </Button>
              <Button
                asChild
                variant="secondary"
                size="lg"
                className="hover:border-accent hover:bg-accent hover:text-white"
                style={{ borderColor: heroBorder, color: heroText }}
              >
                <Link href="/packages">{t("viewPackages")}</Link>
              </Button>
            </motion.div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 1 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2"
        >
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs uppercase tracking-[0.2em]" style={{ color: heroTextSubtle }}>
              Scroll
            </span>
            <motion.div
              className="h-10 w-px"
              animate={{ scaleY: [0, 1, 0] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut" as const,
              }}
              style={{ transformOrigin: "top", backgroundColor: `${branding.colorAccent}66` }}
            />
          </div>
        </motion.div>
      </section>

      {/* ── Class Types ───────────────────────────────────────── */}
      {classTypes.length > 0 && (
      <section className="bg-surface px-4 py-24">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: "easeOut" as const }}
            className="mb-16 text-center"
          >
            <h2 className="font-display text-3xl font-bold text-foreground sm:text-5xl">
              {t("findYourPractice")}
            </h2>
            <p className="mt-4 text-muted">
              {t("disciplinesGoal", { count: classTypes.length })}
            </p>
          </motion.div>

          <div className={`grid gap-6 ${classTypes.length >= 3 ? "md:grid-cols-3" : classTypes.length === 2 ? "md:grid-cols-2 max-w-3xl mx-auto" : "max-w-md mx-auto"}`}>
            {classTypes.map((cls, i) => {
              const Icon = (cls.icon ? getIconComponent(cls.icon) : null) ?? Dumbbell;
              return (
              <motion.div
                key={cls.id}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-60px" }}
                custom={i}
                variants={fadeUp}
              >
                <Link href={`/schedule?discipline=${encodeURIComponent(cls.name)}`}>
                <div className="group h-full cursor-pointer rounded-2xl border border-border bg-background p-8 shadow-[var(--shadow-warm)] transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                  <div
                    className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl transition-colors"
                    style={{ backgroundColor: `${cls.color}18`, color: cls.color }}
                  >
                    <Icon className="h-7 w-7" />
                  </div>
                  <h3 className="font-display text-xl font-bold text-foreground">
                    {cls.name}
                  </h3>
                  {cls.description && (
                    <p className="mt-3 text-sm leading-relaxed text-muted">
                      {cls.description}
                    </p>
                  )}
                  <div className="mt-6 flex items-center gap-3">
                    <span
                      className="inline-flex items-center rounded-full px-3 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: `${cls.color}15`, color: cls.color }}
                    >
                      {LEVEL_LABELS[cls.level] ?? cls.level}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      <Clock className="h-3.5 w-3.5" />
                      {cls.duration} min
                    </span>
                  </div>
                </div>
                </Link>
              </motion.div>
              );
            })}
          </div>
        </div>
      </section>
      )}

      {/* ── How It Works ──────────────────────────────────────── */}
      <section className="bg-background px-4 py-24">
        <div className="mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: "easeOut" as const }}
            className="mb-16 text-center"
          >
            <h2 className="font-display text-3xl font-bold text-foreground sm:text-5xl">
              {t("howItWorks")}
            </h2>
            <p className="mt-4 text-muted">
              {t("howItWorksSubtitle")}
            </p>
          </motion.div>

          <div className="grid gap-12 md:grid-cols-3">
            {steps.map((step, i) => (
              <motion.div
                key={step.number}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-60px" }}
                custom={i}
                variants={fadeUp}
                className="text-center"
              >
                <span className="font-mono text-6xl font-bold text-accent">
                  {step.number}
                </span>
                <h3 className="mt-4 font-display text-xl font-bold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  {step.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Coaches ────────────────────────────────────────────── */}
      {coaches.length > 0 && (
      <section className="px-4 py-24" style={{ backgroundColor: branding.colorHeroBg }}>
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: "easeOut" as const }}
            className="mb-16 text-center"
          >
            <h2 className="font-display text-3xl font-bold sm:text-5xl" style={{ color: heroText }}>
              {t("ourTeam")}
            </h2>
            <p className="mt-4" style={{ color: heroTextMuted }}>
              {t("coachesSubtitle")}
            </p>
          </motion.div>

          <div
            ref={scrollRef}
            className="flex gap-6 overflow-x-auto pb-4 scrollbar-hide md:grid md:grid-cols-3 md:overflow-visible md:pb-0"
          >
            {coaches.slice(0, 6).map((coach, i) => {
              const photo = coach.photoUrl ?? coach.user?.image;
              const name = coach.name || "Coach";
              const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2);

              return (
                <motion.div
                  key={coach.id}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: "-60px" }}
                  custom={i}
                  variants={fadeUp}
                  className="min-w-[280px] flex-shrink-0 md:min-w-0"
                >
                  <div className="group relative h-full overflow-hidden rounded-2xl">
                    <div className="aspect-[3/4]" style={{ background: `linear-gradient(135deg, ${heroText}15, ${branding.colorAccent}10, ${heroText}08)` }}>
                      {photo ? (
                        <img
                          src={photo}
                          alt={name}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <div className="flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold" style={{ backgroundColor: `${heroText}15`, color: heroTextSubtle }}>
                            {initials}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-6">
                      <h3 className="font-display text-xl font-bold text-white">
                        {name}
                      </h3>
                      <p className="mt-1 text-sm font-medium text-accent">
                        {coach.specialties.join(" & ")}
                      </p>
                      {coach.bio && (
                        <p className="mt-2 text-sm leading-relaxed text-white/60 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                          {coach.bio}
                        </p>
                      )}
                      <Link
                        href="/schedule"
                        className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent transition-colors hover:text-white"
                      >
                        {t("viewClasses")} <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {coaches.length > 6 && (
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mt-10 text-center"
            >
              <Link
                href="/coaches"
                className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-accent"
                style={{ color: heroTextMuted }}
              >
                {t("viewAllCoaches", { count: coaches.length })} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </motion.div>
          )}
        </div>
      </section>
      )}

      {/* ── Packages ───────────────────────────────────────────── */}
      {packages.length > 0 && (() => {
        const displayPkgs = packages.slice(0, 3);
        const cols = displayPkgs.length >= 3 ? "md:grid-cols-3" : displayPkgs.length === 2 ? "md:grid-cols-2 max-w-3xl mx-auto" : "max-w-md mx-auto";
        return (
      <section className="px-4 py-24">
        <div className="mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: "easeOut" as const }}
            className="mb-16 text-center"
          >
            <h2 className="font-display text-3xl font-bold text-foreground sm:text-5xl">
              {t("packages")}
            </h2>
            <p className="mt-4 text-muted">
              {t("packagesSubtitle")}
            </p>
          </motion.div>

          <div className={`grid gap-6 ${cols}`}>
            {displayPkgs.map((pkg, i) => {
              const isHighlight = displayPkgs.length >= 3 ? i === 1 : false;
              const validity = pkg.validDays >= 365
                ? `${Math.round(pkg.validDays / 365)} año${Math.round(pkg.validDays / 365) > 1 ? "s" : ""}`
                : pkg.validDays >= 30
                  ? `${Math.round(pkg.validDays / 30)} mes${Math.round(pkg.validDays / 30) > 1 ? "es" : ""}`
                  : `${pkg.validDays} días`;

              return (
              <motion.div
                key={pkg.id}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-60px" }}
                custom={i}
                variants={fadeUp}
              >
                <div
                  className={`relative h-full rounded-2xl p-8 transition-all duration-300 hover:-translate-y-1 ${
                    isHighlight
                      ? "shadow-lg"
                      : "border border-border bg-white shadow-[var(--shadow-warm)]"
                  } ${pkg.isPromo ? "border-2 border-dashed border-accent/40" : ""}`}
                  style={isHighlight ? { backgroundColor: branding.colorHeroBg, color: heroText } : undefined}
                >
                  {isHighlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-accent text-white shadow-[var(--shadow-warm)]">
                        <Star className="mr-1 h-3 w-3" /> {t("mostPopular")}
                      </Badge>
                    </div>
                  )}
                  {pkg.description && (
                    <p className="text-xs font-medium uppercase tracking-wider text-accent">
                      {pkg.description}
                    </p>
                  )}
                  <h3
                    className={`mt-2 font-display text-2xl font-bold ${
                      isHighlight ? "" : "text-foreground"
                    }`}
                    style={isHighlight ? { color: heroText } : undefined}
                  >
                    {pkg.name}
                  </h3>
                  <div className="mt-4">
                    <span
                      className={`font-mono text-4xl font-bold ${
                        isHighlight ? "text-accent" : "text-foreground"
                      }`}
                    >
                      {formatCurrency(pkg.price)}
                    </span>
                    <span className={`ml-1 text-sm ${isHighlight ? "" : "text-muted"}`} style={isHighlight ? { color: heroTextMuted } : undefined}>
                      {pkg.currency}
                    </span>
                  </div>
                  <div
                    className={`mt-4 space-y-2 text-sm ${
                      isHighlight ? "" : "text-muted"
                    }`}
                    style={isHighlight ? { color: heroTextMuted } : undefined}
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-accent" />
                      {pkg.credits
                        ? `${pkg.credits} ${pkg.credits === 1 ? t("classUnit") : t("classesUnit")}`
                        : t("unlimitedClasses")}
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarCheck className="h-4 w-4 text-accent" />
                      {t("validity")}: {validity}
                    </div>
                  </div>
                  <div className="mt-8">
                    <Button
                      asChild
                      className="w-full"
                      variant={isHighlight ? "default" : "secondary"}
                    >
                      <Link href="/packages">{t("buy")}</Link>
                    </Button>
                  </div>
                </div>
              </motion.div>
              );
            })}
          </div>

          {packages.length > 3 && (
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" as const }}
              className="mt-10 text-center"
            >
              <Link
                href="/packages"
                className="inline-flex items-center gap-1 text-sm font-medium text-accent transition-colors hover:text-accent/80"
              >
                {t("viewAllPackages")} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </motion.div>
          )}
        </div>
      </section>
        );
      })()}

      {/* ── CTA Banner ─────────────────────────────────────────── */}
      <section className="px-4 py-24" style={{ backgroundColor: branding.colorHeroBg }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: "easeOut" as const }}
          className="mx-auto max-w-3xl text-center"
        >
          <Zap className="mx-auto mb-6 h-8 w-8 text-accent" />
          <h2 className="font-display text-4xl font-bold sm:text-5xl md:text-6xl" style={{ color: heroText }}>
            {t("readyToStart")}
          </h2>
          <p className="mx-auto mt-6 max-w-md text-lg" style={{ color: heroTextMuted }}>
            {t("ctaSubtitle")}
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="px-10 text-base">
              <Link href="/schedule">{t("bookYourClass")}</Link>
            </Button>
            <Button
              asChild
              variant="secondary"
              size="lg"
              className="hover:border-accent hover:bg-accent hover:text-white"
              style={{ borderColor: heroBorder, color: heroText }}
            >
              <Link href="/packages">
                {t("viewPackages")} <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </motion.div>
      </section>

      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
