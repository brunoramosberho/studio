"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { FadeIn, Stagger, staggerChild } from "./motion";
import { motion } from "framer-motion";

interface StudioInfo {
  slug: string;
  name: string;
  tagline: string;
  logoUrl: string | null;
  colorAccent: string;
}

export function Studios() {
  const [studios, setStudios] = useState<StudioInfo[]>([]);

  useEffect(() => {
    fetch("/api/public/studios")
      .then((r) => r.json())
      .then((d) => Array.isArray(d) ? setStudios(d) : null)
      .catch(() => {});
  }, []);

  if (studios.length === 0) return null;

  const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "https" : "http";
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";

  return (
    <section className="border-y border-gray-100 bg-gray-50/50 py-16 dark:border-gray-800 dark:bg-gray-900/50">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500">Estudios activos</p>
          <h2
            className="mt-3 text-2xl font-bold text-gray-900 sm:text-3xl dark:text-white"
            style={{ fontFamily: "var(--font-jakarta)" }}
          >
            Ya confían en reserva.fit
          </h2>
        </FadeIn>

        <Stagger className="mt-10 flex flex-wrap items-center justify-center gap-6">
          {studios.map((s) => (
            <motion.a
              key={s.slug}
              variants={staggerChild}
              href={`${protocol}://${s.slug}.${rootDomain}`}
              target="_blank"
              rel="noopener"
              className="group flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-5 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
            >
              {s.logoUrl ? (
                <img src={s.logoUrl} alt={s.name} className="h-8 w-8 rounded-lg object-contain" />
              ) : (
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
                  style={{ backgroundColor: s.colorAccent }}
                >
                  {s.name[0]}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{s.name}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">{s.tagline}</p>
              </div>
              <ArrowRight className="ml-2 h-3.5 w-3.5 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-gray-500 dark:text-gray-600 dark:group-hover:text-gray-400" />
            </motion.a>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
