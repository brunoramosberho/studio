"use client";

import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

function SparkAvatar({ size = 32 }: { size?: number }) {
  return (
    <Image
      src="/spark-avatar.png"
      alt="Spark"
      width={size}
      height={size}
      className="rounded-full bg-accent/10 object-cover"
    />
  );
}

type Pillar = {
  label: string;
  titleStart: string;
  titleEmphasis: string;
  titleEnd: string;
  description: string;
  features: string[];
};

/* ---------- Mock visuals (reused from the previous, longer sections) ---------- */

function MembersMock() {
  return (
    <div className="relative mx-auto w-[280px]">
      <div className="rounded-[2.5rem] border-[6px] border-foreground/90 bg-white shadow-2xl overflow-hidden">
        <div className="mx-auto mt-2 h-5 w-28 rounded-full bg-foreground/90" />
        <div className="px-4 pt-3 pb-6 space-y-3">
          <div className="text-center pt-1 pb-1">
            <p className="text-base font-bold text-foreground">Power HIIT</p>
            <p className="text-[10px] text-muted-foreground">
              Mañana, 7:00 AM · Coach Maria
            </p>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-[10px] font-semibold text-foreground mb-2 text-center">
              Elige tu lugar
            </p>
            <div className="text-center mb-2">
              <div className="inline-block rounded-md bg-foreground px-6 py-0.5 text-[8px] text-white font-medium">
                COACH
              </div>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {Array.from({ length: 20 }).map((_, i) => {
                const taken = [2, 5, 7, 11, 14, 16].includes(i);
                const selected = i === 8;
                return (
                  <div
                    key={i}
                    className={`h-7 rounded-md flex items-center justify-center text-[8px] font-medium ${
                      selected
                        ? "bg-accent text-white"
                        : taken
                        ? "bg-foreground/10 text-muted-foreground"
                        : "bg-surface border border-border text-foreground"
                    }`}
                  >
                    {i + 1}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-xl bg-surface p-3 space-y-1.5">
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Lugares</span>
              <span className="font-semibold text-foreground">6 / 20</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Amigos van</span>
              <span className="font-semibold text-foreground">Emma, Jake</span>
            </div>
          </div>
          <button className="w-full rounded-xl bg-accent text-white text-xs font-semibold py-3">
            Confirmar — Lugar #9
          </button>
        </div>
      </div>
      <div className="absolute -inset-6 -z-10 rounded-[3.5rem] bg-accent/8 blur-3xl" />
      <div className="absolute -right-4 sm:-right-10 bottom-10 rounded-xl bg-white border border-violet/20 shadow-lg p-3 w-44">
        <p className="text-[10px] font-semibold text-violet mb-1">🎉 ¡Nuevo logro!</p>
        <p className="text-[9px] text-foreground">
          Desbloqueaste <strong>Early Bird</strong>
        </p>
        <p className="text-[8px] text-muted-foreground mt-1">20 clases matutinas</p>
      </div>
    </div>
  );
}

function StudioMock() {
  return (
    <div className="relative">
      <div className="absolute -top-6 -right-2 z-10 hidden sm:flex flex-col items-center">
        <Image
          src="/spark-avatar.png"
          alt="Spark"
          width={96}
          height={96}
        />
        <span className="-mt-1 rounded-full bg-white border border-border px-3 py-0.5 text-[11px] font-semibold text-foreground shadow-sm">
          Spark
        </span>
      </div>
      <div className="rounded-2xl border border-border bg-white shadow-xl overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-5 py-3 bg-surface/50">
        <SparkAvatar size={32} />
        <div>
          <p className="text-sm font-semibold text-foreground">Spark</p>
          <p className="text-[10px] text-green-600 font-medium">En línea</p>
        </div>
      </div>
      <div className="p-5 space-y-4 bg-surface/20">
        <div className="flex gap-3">
          <div className="shrink-0">
            <SparkAvatar size={28} />
          </div>
          <div className="rounded-2xl rounded-tl-sm bg-white border border-border p-3 max-w-[85%]">
            <p className="text-xs text-foreground leading-relaxed">
              Buenos días. Tu briefing de hoy:
            </p>
            <div className="mt-2 space-y-1.5 text-xs text-muted">
              <p>
                📈 <strong className="text-foreground">Ingresos +18%</strong> esta
                semana — 12 nuevas membresías.
              </p>
              <p>
                ⚠️ <strong className="text-foreground">3 miembros en riesgo</strong>{" "}
                — sin visitas en 14+ días.
              </p>
              <p>
                🔥 <strong className="text-foreground">HIIT jueves 6 PM</strong> al
                94% — considera abrir otra sesión.
              </p>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <div className="rounded-2xl rounded-tr-sm bg-foreground p-3 max-w-[75%]">
            <p className="text-xs text-white">
              ¿A quién contacto hoy para reducir churn?
            </p>
          </div>
        </div>
      </div>
      <div className="border-t border-border px-4 py-3 flex items-center gap-3">
        <div className="flex-1 rounded-full bg-surface border border-border px-4 py-2 text-xs text-muted-foreground">
          Pregúntale lo que sea sobre tu studio...
        </div>
        <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center">
          <svg
            className="h-4 w-4 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        </div>
      </div>
      </div>
    </div>
  );
}

function CoachesMock() {
  return (
    <div className="rounded-2xl border border-border bg-white shadow-xl p-5 space-y-4">
      <p className="text-sm font-semibold text-foreground">Coach Maria · Hoy</p>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Clases hoy", value: "3" },
          { label: "Asistentes", value: "42" },
          { label: "Rating", value: "4.9" },
          { label: "Ganancias", value: "$540" },
        ].map((k) => (
          <div key={k.label} className="rounded-xl bg-surface p-3">
            <p className="text-[10px] font-medium text-muted">{k.label}</p>
            <p className="text-xl font-bold text-foreground">{k.value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl bg-surface p-3">
        <p className="text-[10px] font-semibold text-foreground mb-2">
          Power HIIT · 7:00 AM · 14 / 20
        </p>
        <div className="flex -space-x-2">
          {["A", "C", "E", "J", "M", "S"].map((n, i) => (
            <div
              key={i}
              className="h-7 w-7 rounded-full bg-accent/10 ring-2 ring-white flex items-center justify-center text-accent font-bold text-[10px]"
            >
              {n}
            </div>
          ))}
          <div className="h-7 w-7 rounded-full bg-foreground/10 ring-2 ring-white flex items-center justify-center text-muted-foreground font-bold text-[9px]">
            +8
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button className="flex-1 rounded-lg border border-border bg-white py-2 text-[11px] font-semibold text-foreground">
          Mi disponibilidad
        </button>
        <button className="flex-1 rounded-lg bg-accent/10 py-2 text-[11px] font-semibold text-accent">
          Pedir suplencia
        </button>
      </div>
    </div>
  );
}

const mocks: Record<string, () => React.JSX.Element> = {
  members: MembersMock,
  studio: StudioMock,
  coaches: CoachesMock,
};

function PillarBlock({
  id,
  data,
  reverse,
}: {
  id: string;
  data: Pillar;
  reverse: boolean;
}) {
  const Mock = mocks[id];
  return (
    <div
      id={id}
      className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center scroll-mt-24"
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className={reverse ? "lg:order-2" : ""}
      >
        <p className="text-sm font-semibold text-accent mb-3">{data.label}</p>
        <h3 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground leading-tight">
          {data.titleStart}
          <em className="not-italic text-gradient">{data.titleEmphasis}</em>
          {data.titleEnd}
        </h3>
        <p className="mt-4 text-base text-muted leading-relaxed">
          {data.description}
        </p>
        <ul className="mt-6 space-y-3">
          {data.features.map((f) => (
            <li key={f} className="flex items-start gap-3">
              <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10">
                <svg
                  className="h-3 w-3 text-accent"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </span>
              <span className="text-sm text-muted">{f}</span>
            </li>
          ))}
        </ul>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className={reverse ? "lg:order-1" : ""}
      >
        <Mock />
      </motion.div>
    </div>
  );
}

export function Pillars() {
  const t = useTranslations("marketing");
  const order = ["members", "studio", "coaches"] as const;

  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6 lg:px-8 space-y-24 md:space-y-32">
        {order.map((id, i) => (
          <PillarBlock
            key={id}
            id={id}
            data={t.raw(`pillars.${id}`) as Pillar}
            reverse={i % 2 === 1}
          />
        ))}
      </div>
    </section>
  );
}
