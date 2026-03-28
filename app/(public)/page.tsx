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

interface ClassTypeData {
  id: string;
  name: string;
  description: string | null;
  duration: number;
  level: string;
  color: string;
  icon: string | null;
}

const LEVEL_LABELS: Record<string, string> = {
  ALL: "Todos los niveles",
  BEGINNER: "Principiante",
  INTERMEDIATE: "Intermedio",
  ADVANCED: "Avanzado",
};

const steps = [
  {
    number: "01",
    title: "Elige tu clase",
    description:
      "Explora nuestro horario y encuentra la clase perfecta para ti.",
  },
  {
    number: "02",
    title: "Reserva en segundos",
    description:
      "Asegura tu lugar con un tap. Sin complicaciones, sin llamadas.",
  },
  {
    number: "03",
    title: "Muévete con nosotras",
    description:
      "Llega al studio, respira profundo y disfruta cada movimiento.",
  },
];

interface CoachData {
  id: string;
  bio: string | null;
  specialties: string[];
  photoUrl: string | null;
  user: { name: string | null; image: string | null };
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [coaches, setCoaches] = useState<CoachData[]>([]);
  const [packages, setPackages] = useState<PackageData[]>([]);
  const [classTypes, setClassTypes] = useState<ClassTypeData[]>([]);
  const branding = useBranding();

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
      <section className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#1C1917] px-4">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(201,169,110,0.12)_0%,_transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(201,169,110,0.06)_0%,_transparent_50%)]" />

        <motion.div
          className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 1.5, delay: 0.8, ease: "easeOut" as const }}
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, #C9A96E 50%, transparent 100%)",
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
              className="font-display text-6xl font-bold leading-[0.95] tracking-tight text-white sm:text-8xl"
            >
              {branding.slogan.split(".").filter(Boolean).map((part, i, arr) =>
                i === arr.length - 1 ? (
                  <span key={i} className="text-accent">{part.trim()}.</span>
                ) : (
                  <span key={i}>{part.trim()}.<br /></span>
                ),
              )}
            </motion.h1>

            <motion.p
              variants={fadeUp}
              custom={2}
              className="mx-auto mt-8 max-w-lg text-lg leading-relaxed text-white/60 sm:text-xl"
            >
              {branding.metaDescription}
            </motion.p>

            <motion.div
              variants={fadeUp}
              custom={3}
              className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
            >
              <Button asChild size="lg" className="px-10 text-base">
                <Link href="/schedule">Reservar clase</Link>
              </Button>
              <Button
                asChild
                variant="secondary"
                size="lg"
                className="border-white/20 text-white hover:border-accent hover:bg-accent hover:text-white"
              >
                <Link href="/packages">Primera clase €9</Link>
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
            <span className="text-xs uppercase tracking-[0.2em] text-white/30">
              Scroll
            </span>
            <motion.div
              className="h-10 w-px bg-accent/40"
              animate={{ scaleY: [0, 1, 0] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut" as const,
              }}
              style={{ transformOrigin: "top" }}
            />
          </div>
        </motion.div>
      </section>

      {/* ── Class Types ───────────────────────────────────────── */}
      {classTypes.length > 0 && (
      <section className="bg-[#1C1917] px-4 pb-24 pt-12">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: "easeOut" as const }}
            className="mb-16 text-center"
          >
            <h2 className="font-display text-3xl font-bold text-white sm:text-5xl">
              Encuentra tu práctica
            </h2>
            <p className="mt-4 text-white/50">
              {classTypes.length} disciplina{classTypes.length !== 1 ? "s" : ""}, un objetivo: que te sientas increíble.
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
                <div className="group h-full cursor-pointer rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm transition-all duration-300 hover:border-accent/30 hover:bg-white/[0.08]">
                  <div
                    className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl transition-colors"
                    style={{ backgroundColor: `${cls.color}20`, color: cls.color }}
                  >
                    <Icon className="h-7 w-7" />
                  </div>
                  <h3 className="font-display text-xl font-bold text-white">
                    {cls.name}
                  </h3>
                  {cls.description && (
                    <p className="mt-3 text-sm leading-relaxed text-white/50">
                      {cls.description}
                    </p>
                  )}
                  <div className="mt-6 flex items-center gap-3">
                    <span
                      className="inline-flex items-center rounded-full px-3 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: `${cls.color}20`, color: cls.color }}
                    >
                      {LEVEL_LABELS[cls.level] ?? cls.level}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-white/40">
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
      <section className="bg-surface px-4 py-24">
        <div className="mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: "easeOut" as const }}
            className="mb-16 text-center"
          >
            <h2 className="font-display text-3xl font-bold text-foreground sm:text-5xl">
              Así de fácil
            </h2>
            <p className="mt-4 text-muted">
              De tu celular al reformer en tres pasos.
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
      <section className="bg-[#1C1917] px-4 py-24">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: "easeOut" as const }}
            className="mb-16 text-center"
          >
            <h2 className="font-display text-3xl font-bold text-white sm:text-5xl">
              Conoce a tu coach
            </h2>
            <p className="mt-4 text-white/50">
              Expertas apasionadas que te guiarán en cada movimiento.
            </p>
          </motion.div>

          <div
            ref={scrollRef}
            className="flex gap-6 overflow-x-auto pb-4 scrollbar-hide md:grid md:grid-cols-3 md:overflow-visible md:pb-0"
          >
            {coaches.map((coach, i) => {
              const photo = coach.photoUrl ?? coach.user.image;
              const name = coach.user.name ?? "Coach";
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
                    <div className="aspect-[3/4] bg-gradient-to-br from-white/10 via-accent/5 to-white/5">
                      {photo ? (
                        <img
                          src={photo}
                          alt={name}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10 text-3xl font-bold text-white/40">
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
                        Ver clases <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Packages ───────────────────────────────────────────── */}
      {packages.length > 0 && (
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
              Paquetes
            </h2>
            <p className="mt-4 text-muted">
              Elige el plan que se adapte a tu ritmo.
            </p>
          </motion.div>

          <div className={`grid gap-6 ${packages.length >= 3 ? "md:grid-cols-3" : packages.length === 2 ? "md:grid-cols-2 max-w-3xl mx-auto" : "max-w-md mx-auto"}`}>
            {packages.map((pkg, i) => {
              const isHighlight = packages.length >= 3 ? i === Math.floor(packages.length / 2) : false;
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
                      ? "bg-[#1C1917] text-white shadow-[0_8px_32px_rgba(201,169,110,0.15)]"
                      : "border border-border bg-white shadow-[var(--shadow-warm)]"
                  } ${pkg.isPromo ? "border-2 border-dashed border-accent/40" : ""}`}
                >
                  {isHighlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-accent text-white shadow-[var(--shadow-warm)]">
                        <Star className="mr-1 h-3 w-3" /> Más popular
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
                      isHighlight ? "text-white" : "text-foreground"
                    }`}
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
                    <span className={`ml-1 text-sm ${isHighlight ? "text-white/50" : "text-muted"}`}>
                      {pkg.currency}
                    </span>
                  </div>
                  <div
                    className={`mt-4 space-y-2 text-sm ${
                      isHighlight ? "text-white/60" : "text-muted"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-accent" />
                      {pkg.credits
                        ? `${pkg.credits} ${pkg.credits === 1 ? "clase" : "clases"}`
                        : "Clases ilimitadas"}
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarCheck className="h-4 w-4 text-accent" />
                      Vigencia: {validity}
                    </div>
                  </div>
                  <div className="mt-8">
                    <Button
                      asChild
                      className="w-full"
                      variant={isHighlight ? "default" : "secondary"}
                    >
                      <Link href="/packages">Comprar</Link>
                    </Button>
                  </div>
                </div>
              </motion.div>
              );
            })}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" as const }}
            className="mt-8 text-center"
          >
            <Link
              href="/packages"
              className="inline-flex items-center gap-1 text-sm font-medium text-accent transition-colors hover:text-accent/80"
            >
              Ver todos los paquetes <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </motion.div>
        </div>
      </section>
      )}

      {/* ── CTA Banner ─────────────────────────────────────────── */}
      <section className="bg-[#1C1917] px-4 py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: "easeOut" as const }}
          className="mx-auto max-w-3xl text-center"
        >
          <Zap className="mx-auto mb-6 h-8 w-8 text-accent" />
          <h2 className="font-display text-4xl font-bold text-white sm:text-5xl md:text-6xl">
            ¿Lista para empezar?
          </h2>
          <p className="mx-auto mt-6 max-w-md text-lg text-white/50">
            Tu primera clase es a solo €9. Reserva hoy y descubre lo que tu
            cuerpo puede lograr.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="px-10 text-base">
              <Link href="/schedule">Ver horarios</Link>
            </Button>
            <Button
              asChild
              variant="secondary"
              size="lg"
              className="border-white/20 text-white hover:border-accent hover:bg-accent hover:text-white"
            >
              <Link href="/packages">
                Ver paquetes <ArrowRight className="ml-2 h-4 w-4" />
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
