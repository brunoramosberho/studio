"use client";

import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import {
  ArrowRight,
  Clock,
  Dumbbell,
  Sparkles,
  Wind,
  Star,
  CheckCircle2,
  CalendarCheck,
  Heart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

function AnimatedSection({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 32 }}
      transition={{ duration: 0.6, ease: "easeOut", delay }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

const classTypes = [
  {
    icon: Dumbbell,
    name: "Reformer Pilates",
    description:
      "Fortalece y alarga tu cuerpo en nuestros equipos Balanced Body. Trabajo de resistencia con resortes para un core de acero.",
    level: "Todos los niveles",
    duration: "50 min",
  },
  {
    icon: Wind,
    name: "Mat Flow",
    description:
      "Pilates clásico en mat con transiciones fluidas. Conecta respiración y movimiento en una práctica meditativa.",
    level: "Principiante",
    duration: "45 min",
  },
  {
    icon: Sparkles,
    name: "Barre Fusion",
    description:
      "Lo mejor de ballet, pilates y yoga. Movimientos pequeños y controlados que esculpen y tonifican cada músculo.",
    level: "Intermedio",
    duration: "55 min",
  },
];

const steps = [
  {
    number: "01",
    title: "Elige tu clase",
    description: "Explora nuestro horario y encuentra la clase perfecta para ti.",
  },
  {
    number: "02",
    title: "Reserva en segundos",
    description: "Asegura tu lugar con un tap. Sin complicaciones, sin llamadas.",
  },
  {
    number: "03",
    title: "Muévete con nosotras",
    description: "Llega al studio, respira profundo y disfruta cada movimiento.",
  },
];

const coaches = [
  {
    name: "Valentina Reyes",
    specialty: "Reformer & Pre/Postnatal",
    bio: "Certificada en STOTT Pilates con 8 años transformando cuerpos y mentes.",
    image: null,
  },
  {
    name: "Carolina Mendoza",
    specialty: "Mat Flow & Flexibility",
    bio: "Bailarina profesional convertida en instructora. Su flow es poesía en movimiento.",
    image: null,
  },
  {
    name: "Isabela Torres",
    specialty: "Barre Fusion & Strength",
    bio: "Ex atleta olímpica que encontró su pasión enseñando Barre y fuerza funcional.",
    image: null,
  },
];

const packages = [
  {
    name: "Primera Vez",
    price: 150,
    credits: 1,
    validity: "7 días",
    highlight: false,
    promo: true,
    description: "Tu primera clase con nosotras",
  },
  {
    name: "Pack 10 Clases",
    price: 2800,
    credits: 10,
    validity: "60 días",
    highlight: true,
    promo: false,
    description: "Más popular",
  },
  {
    name: "Ilimitado Mensual",
    price: 3900,
    credits: null,
    validity: "30 días",
    highlight: false,
    promo: false,
    description: "Experiencia completa",
  },
];

const testimonials = [
  {
    quote:
      "Flō cambió mi relación con el ejercicio. Por primera vez disfruto cada sesión y veo resultados reales.",
    name: "Mariana G.",
    detail: "Clienta desde 2024",
  },
  {
    quote:
      "Las coaches son increíbles. Cada clase se siente personalizada aunque estés en grupo. La atención al detalle es impecable.",
    name: "Sofía L.",
    detail: "Pack Ilimitado",
  },
  {
    quote:
      "Después de mi embarazo, Flō me ayudó a recuperar fuerza y confianza. El prenatal con Valentina es una maravilla.",
    name: "Andrea R.",
    detail: "Reformer Pre/Postnatal",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" as const, delay: i * 0.12 },
  }),
};

export default function LandingPage() {
  return (
    <div className="overflow-x-hidden">
      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="relative flex min-h-[85dvh] items-center justify-center overflow-hidden px-4">
        <div
          className="absolute inset-0 -z-10 animate-[gradient-shift_8s_ease-in-out_infinite]"
          style={{
            background:
              "linear-gradient(135deg, #FAF9F6 0%, #F5F2ED 25%, #E8D9BF 50%, #C9A96E20 75%, #FAF9F6 100%)",
            backgroundSize: "400% 400%",
          }}
        />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(201,169,110,0.08)_0%,_transparent_60%)]" />

        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.15 } },
            }}
          >
            <motion.p
              variants={fadeUp}
              custom={0}
              className="mb-6 text-sm font-medium uppercase tracking-[0.2em] text-accent"
            >
              Pilates & Wellness Studio
            </motion.p>

            <motion.h1
              variants={fadeUp}
              custom={1}
              className="font-display text-5xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-6xl md:text-7xl lg:text-8xl"
            >
              Muévete.
              <br />
              Respira.
              <br />
              <span className="text-accent">Floréce.</span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              custom={2}
              className="mx-auto mt-8 max-w-lg text-lg text-muted sm:text-xl"
            >
              Clases de Reformer Pilates, Mat Flow y Barre Fusion en un espacio
              diseñado para ti.
            </motion.p>

            <motion.div
              variants={fadeUp}
              custom={3}
              className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
            >
              <Button asChild size="lg">
                <Link href="/schedule">Ver horarios</Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/packages">Primera clase $150</Link>
              </Button>
            </motion.div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <div className="flex flex-col items-center gap-2 text-muted/60">
            <span className="text-xs tracking-wider">Scroll</span>
            <div className="h-8 w-px bg-accent/30" />
          </div>
        </motion.div>
      </section>

      {/* ── Class Types ───────────────────────────────────────── */}
      <AnimatedSection className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
            Encuentra tu práctica
          </h2>
          <p className="mt-4 text-muted">
            Tres disciplinas, un objetivo: que te sientas increíble.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {classTypes.map((cls, i) => (
            <motion.div
              key={cls.name}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              custom={i}
              variants={fadeUp}
            >
              <Card className="group h-full cursor-pointer transition-all duration-300 hover:shadow-[var(--shadow-warm-md)] hover:-translate-y-1">
                <CardContent className="flex h-full flex-col p-8">
                  <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-white">
                    <cls.icon className="h-7 w-7" />
                  </div>
                  <h3 className="font-display text-xl font-bold text-foreground">
                    {cls.name}
                  </h3>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">
                    {cls.description}
                  </p>
                  <div className="mt-6 flex items-center gap-3">
                    <Badge variant="level">{cls.level}</Badge>
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      <Clock className="h-3.5 w-3.5" />
                      {cls.duration}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </AnimatedSection>

      {/* ── How It Works ──────────────────────────────────────── */}
      <AnimatedSection className="bg-surface/50 px-4 py-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-16 text-center">
            <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
              Así de fácil
            </h2>
            <p className="mt-4 text-muted">
              De tu celular al reformer en tres pasos.
            </p>
          </div>

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
                <span className="font-mono text-5xl font-medium text-accent/30">
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
      </AnimatedSection>

      {/* ── Coaches ────────────────────────────────────────────── */}
      <AnimatedSection className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
            Conoce a tu coach
          </h2>
          <p className="mt-4 text-muted">
            Expertas apasionadas que te guiarán en cada movimiento.
          </p>
        </div>

        <div className="flex gap-6 overflow-x-auto pb-4 scrollbar-hide md:grid md:grid-cols-3 md:overflow-visible md:pb-0">
          {coaches.map((coach, i) => (
            <motion.div
              key={coach.name}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              custom={i}
              variants={fadeUp}
              className="min-w-[280px] flex-shrink-0 md:min-w-0"
            >
              <Card className="group h-full overflow-hidden transition-all duration-300 hover:shadow-[var(--shadow-warm-md)]">
                <div className="aspect-[3/4] bg-gradient-to-br from-accent/10 via-surface to-accent-soft/20">
                  <div className="flex h-full items-center justify-center">
                    <div className="flex h-24 w-24 items-center justify-center rounded-full bg-accent/10">
                      <Heart className="h-10 w-10 text-accent/40" />
                    </div>
                  </div>
                </div>
                <CardContent className="p-6">
                  <h3 className="font-display text-lg font-bold text-foreground">
                    {coach.name}
                  </h3>
                  <p className="mt-1 text-sm font-medium text-accent">
                    {coach.specialty}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    {coach.bio}
                  </p>
                  <Link
                    href="/coaches"
                    className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent transition-colors hover:text-accent/80"
                  >
                    Ver clases <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </AnimatedSection>

      {/* ── Packages ───────────────────────────────────────────── */}
      <AnimatedSection className="bg-surface/50 px-4 py-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-16 text-center">
            <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
              Paquetes
            </h2>
            <p className="mt-4 text-muted">
              Elige el plan que se adapte a tu ritmo.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {packages.map((pkg, i) => (
              <motion.div
                key={pkg.name}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-60px" }}
                custom={i}
                variants={fadeUp}
              >
                <Card
                  className={`relative h-full transition-all duration-300 hover:shadow-[var(--shadow-warm-md)] hover:-translate-y-1 ${
                    pkg.highlight
                      ? "border-2 border-accent shadow-[var(--shadow-warm-lift)]"
                      : ""
                  } ${pkg.promo ? "border-2 border-dashed border-accent/40" : ""}`}
                >
                  {pkg.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-accent text-white shadow-[var(--shadow-warm)]">
                        <Star className="mr-1 h-3 w-3" /> Más popular
                      </Badge>
                    </div>
                  )}
                  <CardContent className="flex h-full flex-col p-8">
                    <p className="text-xs font-medium uppercase tracking-wider text-accent">
                      {pkg.description}
                    </p>
                    <h3 className="mt-2 font-display text-2xl font-bold text-foreground">
                      {pkg.name}
                    </h3>
                    <div className="mt-4">
                      <span className="font-mono text-4xl font-medium text-foreground">
                        {formatCurrency(pkg.price)}
                      </span>
                    </div>
                    <div className="mt-4 space-y-2 text-sm text-muted">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-accent" />
                        {pkg.credits
                          ? `${pkg.credits} ${pkg.credits === 1 ? "clase" : "clases"}`
                          : "Clases ilimitadas"}
                      </div>
                      <div className="flex items-center gap-2">
                        <CalendarCheck className="h-4 w-4 text-accent" />
                        Vigencia: {pkg.validity}
                      </div>
                    </div>
                    <div className="mt-auto pt-8">
                      <Button
                        asChild
                        className="w-full"
                        variant={pkg.highlight ? "default" : "secondary"}
                      >
                        <Link href="/packages">Comprar</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/packages"
              className="inline-flex items-center gap-1 text-sm font-medium text-accent transition-colors hover:text-accent/80"
            >
              Ver todos los paquetes <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </AnimatedSection>

      {/* ── Testimonials ───────────────────────────────────────── */}
      <AnimatedSection className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
            Lo que dicen nuestras clientas
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              custom={i}
              variants={fadeUp}
            >
              <Card className="h-full">
                <CardContent className="flex h-full flex-col p-8">
                  <div className="mb-4 flex gap-1">
                    {[...Array(5)].map((_, j) => (
                      <Star
                        key={j}
                        className="h-4 w-4 fill-accent text-accent"
                      />
                    ))}
                  </div>
                  <blockquote className="flex-1 text-sm leading-relaxed text-foreground/80">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <div className="mt-6 border-t border-border pt-4">
                    <p className="font-display text-sm font-bold text-foreground">
                      {t.name}
                    </p>
                    <p className="text-xs text-muted">{t.detail}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </AnimatedSection>

      {/* ── Footer CTA ─────────────────────────────────────────── */}
      <AnimatedSection className="px-4 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl md:text-5xl">
            ¿Lista para empezar?
          </h2>
          <p className="mx-auto mt-6 max-w-md text-lg text-muted">
            Tu primera clase es a solo $150. Reserva hoy y descubre lo que tu
            cuerpo puede lograr.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button asChild size="lg">
              <Link href="/schedule">Reservar mi clase</Link>
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link href="/packages">
                Ver paquetes <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </AnimatedSection>

      <style jsx global>{`
        @keyframes gradient-shift {
          0%,
          100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }
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
