"use client";

import { motion } from "framer-motion";

export function MarketingHero() {
  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-surface/60 to-white pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-4 py-1.5 text-sm font-medium text-muted mb-8"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            Built for boutique fitness studios
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-foreground leading-[1.08]"
          >
            Replace 10 tools with{" "}
            <em className="not-italic text-gradient">one</em> —{" "}
            <br className="hidden sm:block" />
            no add-ons, no surprises
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto mt-6 max-w-2xl text-lg md:text-xl text-muted leading-relaxed"
          >
            Scheduling, payments, member engagement, AI insights, and
            community — all in one platform designed for studios that refuse to
            settle.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <a
              href="#cta"
              className="btn-gradient inline-flex h-12 items-center rounded-full px-8 text-base font-semibold shadow-lg shadow-accent/25"
            >
              Book a Demo →
            </a>
            <a
              href="#why-mgic"
              className="inline-flex h-12 items-center rounded-full border border-border bg-white px-8 text-base font-semibold text-foreground transition-all hover:bg-surface hover:-translate-y-0.5"
            >
              See How It Works
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-8 flex flex-col items-center gap-2"
          >
            <div className="flex items-center gap-3 sm:gap-5 text-sm font-semibold text-foreground">
              <span>Free trial</span>
              <span className="h-1 w-1 rounded-full bg-accent" />
              <span>Contract buyout</span>
              <span className="h-1 w-1 rounded-full bg-accent" />
              <span>One-night migration</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Trusted by 200+ boutique studios worldwide
            </p>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mx-auto mt-16 max-w-5xl"
        >
          <div className="relative rounded-2xl border border-border bg-white shadow-2xl shadow-black/5 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3 bg-surface/50">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-400/60" />
                <div className="h-3 w-3 rounded-full bg-yellow-400/60" />
                <div className="h-3 w-3 rounded-full bg-green-400/60" />
              </div>
              <div className="ml-3 flex-1 rounded-md bg-white border border-border px-3 py-1 text-xs text-muted-foreground">
                app.mgic.app/admin/dashboard
              </div>
            </div>
            <div className="p-6 md:p-8 bg-surface/30">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[
                  { label: "Today's Bookings", value: "47", change: "+12%" },
                  { label: "Weekly Revenue", value: "$8,240", change: "+18%" },
                  { label: "Active Members", value: "312", change: "+8%" },
                  { label: "Avg Occupancy", value: "87%", change: "+5%" },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="rounded-xl border border-border bg-white p-4"
                  >
                    <p className="text-xs font-medium text-muted">{kpi.label}</p>
                    <p className="mt-1 text-2xl font-bold text-foreground">
                      {kpi.value}
                    </p>
                    <p className="mt-1 text-xs font-medium text-green-600">
                      {kpi.change}
                    </p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-border bg-white p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-foreground">
                    Weekly Revenue
                  </p>
                  <div className="flex gap-2">
                    {["1W", "1M", "3M"].map((t) => (
                      <span
                        key={t}
                        className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                          t === "1W"
                            ? "bg-foreground text-white"
                            : "text-muted bg-surface"
                        }`}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-end gap-1.5 h-32">
                  {[40, 55, 35, 70, 60, 85, 75].map((h, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t-md bg-accent/80 transition-all"
                        style={{ height: `${h}%` }}
                      />
                      <span className="text-[10px] text-muted-foreground">
                        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
