"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, ArrowRight, TrendingUp, TrendingDown, Telescope } from "lucide-react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useBranding } from "@/components/branding-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { useMgicAI } from "./index";
import { formatCurrency } from "@/lib/utils";
import type { StreamEvent } from "@/lib/ai/types";

// Keep types aligned with the Finance page API
interface FinanceSummary {
  grossRevenue: number;
  mrr: number;
  activeMemberships: number;
  newMembershipsThisMonth: number;
  failedPaymentsAmount: number;
  failedPaymentsCount: number;
  upcomingRenewalsAmount: number;
  upcomingRenewalsCount: number;
  vsPreviousPeriod: { grossRevenue: number; mrr: number };
}

interface BySource {
  source: string;
  amount: number;
  percent: number;
}

interface DailyRevenue {
  date: string;
  amount: number;
}

interface FinanceData {
  summary: FinanceSummary;
  bySource: BySource[];
  dailyRevenue: DailyRevenue[];
}

interface ClassTypeStat {
  name: string;
  classesHeld: number;
  totalCapacity: number;
  seatsBooked: number;
  emptySeats: number;
  fillRate: number;
  avgAttendees: number;
}

interface CoachStat {
  name: string;
  classesHeld: number;
  totalCapacity: number;
  seatsBooked: number;
  fillRate: number;
  payType: string | null;
}

interface TimeSlotStat {
  dayOfWeek: number;
  dayLabel: string;
  hour: number;
  classesHeld: number;
  fillRate: number;
}

interface CohortStat {
  month: string;
  joined: number;
  stillActive: number;
  retentionPct: number;
}

interface InsightsData {
  classTypeTop: ClassTypeStat[];
  classTypeBottom: ClassTypeStat[];
  coachTop: CoachStat[];
  coachBottom: CoachStat[];
  timeSlotTop: TimeSlotStat[];
  timeSlotBottom: TimeSlotStat[];
  mrrConcentration: {
    totalMrr: number;
    top10Share: number;
    topMembers: { name: string; amount: number; packageName: string }[];
  };
  mrrAtRisk: {
    count: number;
    exposedMrr: number;
    members: { name: string; amount: number; daysInactive: number }[];
  };
  retentionCohorts: CohortStat[];
  waitlistHotspots: {
    classType: string;
    waitlistedClasses: number;
    totalWaitlisted: number;
  }[];
  meta: {
    range: string;
    classesAnalyzed: number;
    activeSubscriptions: number;
  };
}

const SOURCE_COLORS: Record<string, string> = {
  subscriptions: "#1C2340",
  packages: "#378ADD",
  products: "#1D9E75",
  penalties: "#E24B4A",
  classpass: "#7F77DD",
};

const SOURCE_LABELS: Record<string, string> = {
  subscriptions: "Suscripciones",
  packages: "Paquetes",
  products: "Productos",
  penalties: "Penalidades",
  classpass: "Externas",
};

function todayKey(prefix: string, range: string) {
  return `${prefix}-${range}-${new Date().toISOString().slice(0, 10)}`;
}

function formatHour(h: number) {
  return `${h.toString().padStart(2, "0")}:00`;
}

function buildCfoPrompt(params: {
  firstName: string;
  studioName: string;
  range: string;
  data: FinanceData;
  insights: InsightsData | null;
}) {
  const { firstName, studioName, range, data, insights } = params;
  const { summary, bySource, dailyRevenue } = data;

  const rangeLabel: Record<string, string> = {
    today: "hoy",
    month: "este mes",
    last30: "los últimos 30 días",
    last90: "los últimos 90 días",
    year: "este año",
  };

  const breakdown = bySource
    .map((s) => `${SOURCE_LABELS[s.source] ?? s.source}: ${formatCurrency(s.amount)} (${s.percent}%)`)
    .join(" · ");

  // Trend slope heuristic (first half vs second half of the period)
  let trendNote = "";
  if (dailyRevenue.length >= 4) {
    const mid = Math.floor(dailyRevenue.length / 2);
    const firstHalf = dailyRevenue.slice(0, mid).reduce((a, b) => a + b.amount, 0);
    const secondHalf = dailyRevenue.slice(mid).reduce((a, b) => a + b.amount, 0);
    if (firstHalf > 0) {
      const change = ((secondHalf - firstHalf) / firstHalf) * 100;
      trendNote = `Tendencia intra-periodo: segunda mitad vs primera ${change >= 0 ? "+" : ""}${change.toFixed(1)}%.`;
    }
  }

  const salesDays = dailyRevenue.filter((d) => d.amount > 0).length;
  const totalDays = dailyRevenue.length;
  const avgDaily = totalDays > 0 ? summary.grossRevenue / totalDays : 0;
  const peakDay = dailyRevenue.reduce(
    (best, d) => (d.amount > best.amount ? d : best),
    dailyRevenue[0] ?? { date: "", amount: 0 },
  );

  // ─── Build insights sections if available ─────────────────
  let operationalSection = "";
  if (insights && insights.meta.classesAnalyzed > 0) {
    const topClasses = insights.classTypeTop
      .map((c) => `${c.name} ${c.fillRate}% (${c.seatsBooked}/${c.totalCapacity} asientos, ${c.classesHeld} clases)`)
      .join(" · ");
    const bottomClasses = insights.classTypeBottom
      .map((c) => `${c.name} ${c.fillRate}% (${c.emptySeats} asientos vacíos en ${c.classesHeld} clases)`)
      .join(" · ");
    const topCoaches = insights.coachTop
      .map(
        (c) =>
          `${c.name} ${c.seatsBooked} alumnos en ${c.classesHeld} clases (fill ${c.fillRate}%${c.payType ? ", paga " + c.payType : ""})`,
      )
      .join(" · ");
    const bottomCoaches = insights.coachBottom
      .map(
        (c) =>
          `${c.name} fill ${c.fillRate}% en ${c.classesHeld} clases${c.payType ? " (paga " + c.payType + ")" : ""}`,
      )
      .join(" · ");
    const topSlots = insights.timeSlotTop
      .map((s) => `${s.dayLabel} ${formatHour(s.hour)} ${s.fillRate}%`)
      .join(" · ");
    const bottomSlots = insights.timeSlotBottom
      .map((s) => `${s.dayLabel} ${formatHour(s.hour)} ${s.fillRate}%`)
      .join(" · ");

    operationalSection = `
RENTABILIDAD POR CLASE (proxy = fill rate, no revenue exacto porque la gente paga via suscripción/paquete, pero capacidad vacía = coste de coach desperdiciado)
- Clases más ocupadas: ${topClasses || "—"}
- Clases con más capacidad desperdiciada: ${bottomClasses || "—"}

PERFORMANCE DE COACHES (proxy de "ingresos generados" = alumnos servidos; payType indica si el coste es fijo o variable)
- Coaches con más alumnos: ${topCoaches || "—"}
- Coaches con menor ocupación: ${bottomCoaches || "—"}

HORARIOS
- Mejores slots: ${topSlots || "—"}
- Peores slots: ${bottomSlots || "—"}

DEMANDA INSATISFECHA (waitlists = oportunidad de abrir más clases)
${
  insights.waitlistHotspots.length
    ? insights.waitlistHotspots
        .map((w) => `- ${w.classType}: ${w.totalWaitlisted} personas en waitlist en ${w.waitlistedClasses} clases`)
        .join("\n")
    : "- Sin waitlists relevantes"
}`;
  }

  let recurrenceHealthSection = "";
  if (insights) {
    const concentrationLine = insights.mrrConcentration.totalMrr > 0
      ? `Top 10 miembros = ${insights.mrrConcentration.top10Share}% del MRR (${formatCurrency(insights.mrrConcentration.topMembers.reduce((s, m) => s + m.amount, 0))} de ${formatCurrency(insights.mrrConcentration.totalMrr)})`
      : "Sin MRR activo";

    const atRiskLine = insights.mrrAtRisk.count > 0
      ? `${insights.mrrAtRisk.count} miembros pagan pero no han venido en 21+ días → ${formatCurrency(insights.mrrAtRisk.exposedMrr)} de MRR expuesto a churn`
      : "Cero miembros activos inactivos — señal de salud";

    const cohortLines = insights.retentionCohorts.length
      ? insights.retentionCohorts
          .map((c) => `${c.month}: ${c.stillActive}/${c.joined} siguen activos (${c.retentionPct}%)`)
          .join(" · ")
      : "Sin cohortes recientes";

    recurrenceHealthSection = `
SALUD DEL MRR
- Concentración: ${concentrationLine}
- MRR en riesgo: ${atRiskLine}
- Retención de cohortes recientes: ${cohortLines}`;
  }

  return `Soy ${firstName}, admin de ${studioName}. Acabo de abrir la página de finanzas (/admin/finance) con el período "${rangeLabel[range] ?? range}".

Necesito que actúes como MI CFO de confianza de un boutique studio. No como un chatbot — como el CFO del studio que lleva meses conmigo, conoce la operación, y me va a dar un read rápido de cómo estamos financieramente.

Estos son los datos duros de ${rangeLabel[range] ?? range}:

INGRESOS Y RECURRENCIA
- Ingresos brutos: ${formatCurrency(summary.grossRevenue)} (${summary.vsPreviousPeriod.grossRevenue >= 0 ? "+" : ""}${summary.vsPreviousPeriod.grossRevenue}% vs periodo anterior)
- MRR: ${formatCurrency(summary.mrr)} (${summary.vsPreviousPeriod.mrr >= 0 ? "+" : ""}${summary.vsPreviousPeriod.mrr}% vs periodo anterior)
- Suscripciones activas: ${summary.activeMemberships}
- Nuevas suscripciones este mes: ${summary.newMembershipsThisMonth}

COMPOSICIÓN DE INGRESOS
${breakdown || "Sin datos de composición"}

RIESGOS
- Pagos fallidos: ${formatCurrency(summary.failedPaymentsAmount)} en ${summary.failedPaymentsCount} cargos
- Renovaciones próximas 7 días: ${formatCurrency(summary.upcomingRenewalsAmount)} (${summary.upcomingRenewalsCount} membresías)

COMPORTAMIENTO
- Días con ventas: ${salesDays}/${totalDays}
- Ingreso diario promedio: ${formatCurrency(avgDaily)}
- Día pico: ${peakDay.date || "—"} con ${formatCurrency(peakDay.amount)}
${trendNote ? `- ${trendNote}` : ""}
${operationalSection}
${recurrenceHealthSection}

INSTRUCCIONES PARA TU RESPUESTA:
- Ya tienes todos los datos arriba — responde DIRECTAMENTE sin llamar herramientas.
- Háblame directo, por mi nombre (${firstName}) y mencionando ${studioName} al menos una vez.
- NO repitas los números tal cual te los pasé — interprétalos como un CFO experimentado en fitness boutique.
- Formato: 3-5 bullets con análisis punzante (no genérico). Cada bullet debe decir algo que yo NO vería con solo mirar las tarjetas.
- Prioriza cruces fuertes: p.ej. "tal clase llena + tal coach vacío = reasignar"; "MRR crece pero X miembros pagan sin venir = churn latente"; "top 10 miembros concentran Y% = riesgo si se van"; "waitlist en X slot = abrir más clases".
- Si ves una capacidad desperdiciada clara (clase/coach con fill bajo), mencionarlo es valioso — aunque no haya revenue exacto, el coste del coach sí está ocurriendo.
- Cierra con una línea final en **negritas** con UNA recomendación concreta accionable — la que tú priorizarías si estuvieras en mi silla hoy.
- Tono: directo, cálido, con opinión. Usa emojis sutiles (→ ✓ ⚠ ↑ ↓) cuando aporten.
- No uses encabezados ni tablas. Solo bullets cortos y la recomendación final en negritas.
- Máximo 7 líneas totales.`;
}

const DISMISS_KEY_PREFIX = "mgic-ai-finance-briefing-dismissed";
const CACHE_KEY_PREFIX = "mgic-ai-finance-briefing-cache";

export function FinanceBriefingCard({ range }: { range: string }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState(false);
  const { colorAdmin, studioName } = useBranding();
  const { open, sendMessage, isStreaming } = useMgicAI();
  const { data: session } = useSession();
  const hasFetched = useRef<string | null>(null);

  const adminName = session?.user?.name || "Admin";
  const firstName = adminName.split(" ")[0];

  const { data: finance, isLoading: financeLd } = useQuery<FinanceData>({
    queryKey: ["admin-finance", range],
    queryFn: async () => {
      const res = await fetch(`/api/admin/finance?range=${range}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: insights, isError: insightsError } = useQuery<InsightsData>({
    queryKey: ["admin-finance-insights", range],
    queryFn: async () => {
      const res = await fetch(`/api/admin/finance/insights?range=${range}`);
      if (!res.ok) throw new Error("Failed to fetch insights");
      return res.json();
    },
    retry: 1,
  });

  // Reset state when period changes
  useEffect(() => {
    const dismissKey = todayKey(DISMISS_KEY_PREFIX, range);
    if (typeof window !== "undefined" && localStorage.getItem(dismissKey)) {
      setDismissed(true);
      setLoading(false);
      return;
    }
    setDismissed(false);
    setContent("");
    setError(false);
    setLoading(true);

    const cached = typeof window !== "undefined" ? localStorage.getItem(todayKey(CACHE_KEY_PREFIX, range)) : null;
    if (cached) {
      setContent(cached);
      setLoading(false);
    }
  }, [range]);

  const fetchBriefing = useCallback(async () => {
    if (!finance || !session?.user?.name) return;
    if (dismissed) return;
    // Wait for insights too — they enrich the prompt meaningfully.
    // If insights errored, proceed without them (briefing still works from base finance data).
    if (insights === undefined && !insightsError) return;
    const cacheId = `${range}-${new Date().toISOString().slice(0, 10)}`;
    if (hasFetched.current === cacheId) return;
    if (content) return;
    hasFetched.current = cacheId;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: buildCfoPrompt({
                firstName,
                studioName,
                range,
                data: finance,
                insights: insights ?? null,
              }),
            },
          ],
        }),
      });

      if (!res.ok || !res.body) {
        setError(true);
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          try {
            const event: StreamEvent = JSON.parse(trimmed.slice(6));
            if (event.type === "text_delta") {
              fullText += event.text;
              setContent(fullText);
            }
          } catch {}
        }
      }

      if (fullText) {
        try {
          localStorage.setItem(todayKey(CACHE_KEY_PREFIX, range), fullText);
        } catch {}
      }

      setLoading(false);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, [finance, insights, insightsError, session?.user?.name, dismissed, content, firstName, studioName, range]);

  useEffect(() => {
    fetchBriefing();
  }, [fetchBriefing]);

  const dismiss = () => {
    localStorage.setItem(todayKey(DISMISS_KEY_PREFIX, range), "1");
    setDismissed(true);
  };

  const deepDive = () => {
    const rangeLabel: Record<string, string> = {
      today: "hoy",
      month: "este mes",
      last30: "los últimos 30 días",
      last90: "los últimos 90 días",
      year: "este año",
    };
    const label = rangeLabel[range] ?? range;
    open();
    // Let the panel mount before dispatching the message.
    setTimeout(() => {
      sendMessage(
        `Hazme un análisis profundo de la situación financiera y operativa de ${studioName} (${label}) como CFO del studio.

Usa las herramientas que tengas para cruzar datos reales:
1. Rentabilidad por tipo de clase — fill rate, capacidad desperdiciada y cómo se relaciona con el tipo de pago del coach (MONTHLY_FIXED = coste fijo, PER_CLASS = coste por clase aunque haya pocos alumnos).
2. Ranking de coaches: quién llena más asientos, quién tiene fill rate bajo, y si su modelo de pago tiene sentido para su performance.
3. Concentración de ingresos: qué % del MRR depende de los top miembros, y exposición a churn (miembros que pagan pero llevan semanas sin venir).
4. Demanda insatisfecha (waitlists) y si hay slots donde convendría abrir más clases.
5. Retención por cohorte de los últimos meses.
6. Composición de ingresos (suscripciones vs paquetes vs productos) y qué señales de salud/riesgo muestra.

Al final dame 3 recomendaciones priorizadas: qué hacer YA, qué observar esta semana, qué investigar a fondo. Tono directo, como un CFO con skin in the game. Háblame por mi nombre (${firstName}).`,
      );
    }, 50);
  };

  if (dismissed) return null;

  const vs = finance?.summary.vsPreviousPeriod.grossRevenue ?? 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
        className="overflow-hidden rounded-2xl bg-white shadow-[0_2px_20px_-4px_rgba(0,0,0,0.08)]"
      >
        {/* Gradient accent bar */}
        <div
          className="h-1"
          style={{
            background: `linear-gradient(90deg, ${colorAdmin}, ${colorAdmin}88, ${colorAdmin}44)`,
          }}
        />
        <div className="p-5 sm:p-6">
          {/* Header */}
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm"
                style={{ backgroundColor: `${colorAdmin}15` }}
              >
                <img
                  src="/spark-avatar.png"
                  alt="Spark"
                  className="h-7 w-7 rounded-lg object-cover"
                />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-foreground leading-tight">
                  El read financiero de hoy, {firstName}
                </h3>
                <p className="text-xs text-muted/70 mt-0.5">
                  Spark <span className="font-medium">CFO</span> · análisis en vivo de {studioName}
                </p>
              </div>
            </div>
            <button
              onClick={dismiss}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted/40 transition-colors hover:bg-surface hover:text-muted"
              aria-label="Descartar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="sm:pl-[52px] grid gap-5 lg:grid-cols-[1fr_auto] lg:items-start">
            {/* Content */}
            <div>
              {loading && !content ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 animate-pulse text-muted/30" />
                    <Skeleton className="h-4 w-4/5" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 animate-pulse text-muted/30" />
                    <Skeleton className="h-4 w-3/5" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 animate-pulse text-muted/30" />
                    <Skeleton className="h-4 w-2/5" />
                  </div>
                </div>
              ) : error ? (
                <p className="text-sm text-muted">
                  No pude preparar el análisis financiero ahora. Abre Spark para consultar.
                </p>
              ) : (
                <BriefingMarkdown content={content} accentColor={colorAdmin} />
              )}

              {/* CTA row */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  onClick={deepDive}
                  disabled={isStreaming}
                  className="group inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-all hover:gap-2.5 disabled:opacity-60"
                  style={{ backgroundColor: colorAdmin }}
                >
                  <Telescope className="h-3.5 w-3.5" />
                  Profundiza más
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </button>
                <button
                  onClick={open}
                  className="group inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all hover:gap-2.5"
                  style={{ color: colorAdmin, backgroundColor: `${colorAdmin}10` }}
                >
                  Pregúntale algo al CFO
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            </div>

            {/* Visual mini-dashboard */}
            <div className="lg:w-[280px] rounded-xl border border-stone-100 bg-stone-50/40 p-3">
              {financeLd || !finance ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ) : (
                <>
                  {/* Revenue headline */}
                  <div className="flex items-baseline justify-between gap-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-stone-400">
                        Ingresos brutos
                      </p>
                      <p className="text-lg font-bold leading-none text-foreground mt-1">
                        {formatCurrency(finance.summary.grossRevenue)}
                      </p>
                    </div>
                    <div
                      className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                        vs >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                      }`}
                    >
                      {vs >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {vs >= 0 ? "+" : ""}
                      {vs}%
                    </div>
                  </div>

                  {/* Daily revenue sparkline */}
                  <div className="mt-3">
                    <Sparkline data={finance.dailyRevenue} color={colorAdmin} />
                  </div>

                  {/* Source composition stacked bar */}
                  <div className="mt-3">
                    <p className="text-[10px] uppercase tracking-wider text-stone-400 mb-1.5">
                      Composición
                    </p>
                    <StackedBar sources={finance.bySource} />
                    <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5">
                      {finance.bySource
                        .filter((s) => s.percent > 0)
                        .slice(0, 4)
                        .map((s) => (
                          <div key={s.source} className="flex items-center gap-1">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: SOURCE_COLORS[s.source] ?? "#999" }}
                            />
                            <span className="text-[10px] text-stone-500">
                              {SOURCE_LABELS[s.source] ?? s.source} {s.percent}%
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function Sparkline({ data, color }: { data: DailyRevenue[]; color: string }) {
  const { path, areaPath } = useMemo(() => {
    if (data.length === 0) return { path: "", areaPath: "" };
    const w = 260;
    const h = 44;
    const maxAmt = Math.max(...data.map((d) => d.amount), 1);
    const step = data.length > 1 ? w / (data.length - 1) : 0;
    const points = data.map((d, i) => {
      const x = i * step;
      const y = h - (d.amount / maxAmt) * h;
      return [x, y] as [number, number];
    });
    const pathStr = points.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(" ");
    const areaStr = `${pathStr} L ${w} ${h} L 0 ${h} Z`;
    return { path: pathStr, areaPath: areaStr };
  }, [data]);

  if (data.length === 0) {
    return <div className="h-[44px] flex items-center justify-center text-[10px] text-stone-400">Sin datos</div>;
  }

  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-stone-400 mb-1">Trend diario</p>
      <svg viewBox="0 0 260 44" className="h-11 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="fin-spark-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#fin-spark-grad)" />
        <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function StackedBar({ sources }: { sources: BySource[] }) {
  const visible = sources.filter((s) => s.percent > 0);
  if (visible.length === 0) {
    return <div className="h-2 w-full rounded-full bg-stone-200" />;
  }
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-stone-100">
      {visible.map((s) => (
        <div
          key={s.source}
          className="h-full"
          style={{
            width: `${s.percent}%`,
            backgroundColor: SOURCE_COLORS[s.source] ?? "#999",
          }}
          title={`${SOURCE_LABELS[s.source] ?? s.source}: ${s.percent}%`}
        />
      ))}
    </div>
  );
}

function BriefingMarkdown({ content, accentColor }: { content: string; accentColor: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("### ")) {
      elements.push(
        <p key={i} className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-wider text-muted/60 first:mt-0">
          {formatInline(line.slice(4))}
        </p>,
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <p key={i} className="mb-1.5 mt-3 text-sm font-bold text-foreground first:mt-0">
          {formatInline(line.slice(3))}
        </p>,
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <p key={i} className="mb-2 mt-3 text-base font-bold text-foreground first:mt-0">
          {formatInline(line.slice(2))}
        </p>,
      );
    } else if (/^[-•*]\s/.test(line)) {
      elements.push(
        <div key={i} className="flex gap-2.5 py-1 text-[13px] leading-relaxed text-foreground/80">
          <span
            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: accentColor }}
          />
          <span className="flex-1">{formatInline(line.replace(/^[-•*]\s/, ""))}</span>
        </div>,
      );
    } else if (/^\d+[.)]\s/.test(line)) {
      const num = line.match(/^(\d+)/)?.[1];
      elements.push(
        <div key={i} className="flex gap-2 py-1 text-[13px] leading-relaxed text-foreground/80">
          <span
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: accentColor }}
          >
            {num}
          </span>
          <span className="flex-1">{formatInline(line.replace(/^\d+[.)]\s/, ""))}</span>
        </div>,
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-1" />);
    } else {
      elements.push(
        <p key={i} className="py-0.5 text-[13px] leading-relaxed text-foreground/80">
          {formatInline(line)}
        </p>,
      );
    }
  }

  return <div>{elements}</div>;
}

function formatInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    if (boldMatch && boldMatch.index !== undefined) {
      if (boldMatch.index > 0) {
        parts.push(<span key={key++}>{remaining.slice(0, boldMatch.index)}</span>);
      }
      parts.push(
        <strong key={key++} className="font-semibold text-foreground">
          {boldMatch[1]}
        </strong>,
      );
      remaining = remaining.slice(boldMatch.index + boldMatch[0].length);
      continue;
    }

    const codeMatch = remaining.match(/`(.+?)`/);
    if (codeMatch && codeMatch.index !== undefined) {
      if (codeMatch.index > 0) {
        parts.push(<span key={key++}>{remaining.slice(0, codeMatch.index)}</span>);
      }
      parts.push(
        <code key={key++} className="rounded bg-surface px-1 py-0.5 text-xs font-medium text-foreground">
          {codeMatch[1]}
        </code>,
      );
      remaining = remaining.slice(codeMatch.index + codeMatch[0].length);
      continue;
    }

    parts.push(<span key={key++}>{remaining}</span>);
    break;
  }

  return <>{parts}</>;
}
