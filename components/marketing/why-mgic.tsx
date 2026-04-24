"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";

type Tab = {
  id: string;
  title: string;
  headline: string;
  description: string;
  features: string[];
};

const mockUIByTab: Record<string, () => React.JSX.Element> = {
  scheduling: MockSchedule,
  payments: MockPayments,
  members: MockMembers,
  coaches: MockCoaches,
  marketing: MockMarketing,
};

function MockSchedule() {
  const hours = ["6 AM", "7 AM", "8 AM", "9 AM", "10 AM"];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  return (
    <div className="rounded-xl border border-border bg-white p-4 text-xs">
      <div className="grid grid-cols-6 gap-1">
        <div />
        {days.map((d) => (
          <div key={d} className="text-center font-semibold text-muted py-1">{d}</div>
        ))}
        {hours.map((h) => (
          <React.Fragment key={h}>
            <div className="text-right pr-2 text-muted-foreground py-2">{h}</div>
            {days.map((d, di) => (
              <div
                key={`${h}-${d}`}
                className={`rounded-lg py-2 px-1 text-center ${
                  (di + hours.indexOf(h)) % 3 === 0
                    ? "bg-accent/10 text-accent font-medium border border-accent/20"
                    : (di + hours.indexOf(h)) % 3 === 1
                    ? "bg-violet/10 text-violet font-medium border border-violet/20"
                    : "bg-surface"
                }`}
              >
                {(di + hours.indexOf(h)) % 3 === 0
                  ? "HIIT"
                  : (di + hours.indexOf(h)) % 3 === 1
                  ? "Yoga"
                  : ""}
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function MockPayments() {
  return (
    <div className="rounded-xl border border-border bg-white p-4 space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Gross Revenue", value: "$24,800", sub: "This month" },
          { label: "MRR", value: "$18,200", sub: "+12% vs last month" },
          { label: "Active Memberships", value: "186", sub: "3 expiring" },
        ].map((k) => (
          <div key={k.label} className="rounded-lg bg-surface p-3">
            <p className="text-[10px] font-medium text-muted">{k.label}</p>
            <p className="text-lg font-bold text-foreground">{k.value}</p>
            <p className="text-[10px] text-muted-foreground">{k.sub}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {[
          { name: "Sarah M.", amount: "$149", type: "Unlimited Monthly", status: "Paid" },
          { name: "James K.", amount: "$89", type: "10-Class Pack", status: "Paid" },
          { name: "Lisa R.", amount: "$149", type: "Unlimited Monthly", status: "Retry" },
        ].map((t) => (
          <div
            key={t.name}
            className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-xs"
          >
            <div>
              <span className="font-medium text-foreground">{t.name}</span>
              <span className="ml-2 text-muted-foreground">{t.type}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">{t.amount}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  t.status === "Paid"
                    ? "bg-green-100 text-green-700"
                    : "bg-yellow-100 text-yellow-700"
                }`}
              >
                {t.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockMembers() {
  return (
    <div className="rounded-xl border border-border bg-white p-4 space-y-3">
      <div className="flex gap-2">
        {["All", "Active", "At Risk", "New"].map((f, i) => (
          <span
            key={f}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              i === 0 ? "bg-foreground text-white" : "bg-surface text-muted"
            }`}
          >
            {f}
          </span>
        ))}
      </div>
      <div className="space-y-2">
        {[
          { name: "Ana García", classes: 24, last: "Today", status: "Active", risk: false },
          { name: "Carlos Ruiz", classes: 18, last: "3 days ago", status: "Active", risk: false },
          { name: "Emma Wilson", classes: 6, last: "12 days ago", status: "At Risk", risk: true },
          { name: "David Chen", classes: 2, last: "21 days ago", status: "At Risk", risk: true },
        ].map((m) => (
          <div
            key={m.name}
            className="flex items-center justify-between rounded-lg bg-surface px-3 py-2.5 text-xs"
          >
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-[10px]">
                {m.name.split(" ").map((n) => n[0]).join("")}
              </div>
              <div>
                <span className="font-medium text-foreground">{m.name}</span>
                <span className="ml-2 text-muted-foreground">{m.classes} classes</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Last: {m.last}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  m.risk ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                }`}
              >
                {m.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockCoaches() {
  return (
    <div className="rounded-xl border border-border bg-white p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {[
          { name: "Coach Maria", rating: "4.9", classes: "48", specialty: "HIIT · Strength", color: "bg-accent" },
          { name: "Coach Alex", rating: "4.8", classes: "36", specialty: "Yoga · Pilates", color: "bg-violet" },
        ].map((c) => (
          <div key={c.name} className="rounded-lg bg-surface p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div
                className={`h-8 w-8 rounded-full ${c.color} flex items-center justify-center text-white font-bold text-xs`}
              >
                {c.name.split(" ")[1][0]}
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">{c.name}</p>
                <p className="text-[10px] text-muted-foreground">{c.specialty}</p>
              </div>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Rating: <strong className="text-foreground">{c.rating}</strong></span>
              <span className="text-muted-foreground">Classes: <strong className="text-foreground">{c.classes}</strong></span>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-surface p-3">
        <p className="text-[10px] font-semibold text-foreground mb-2">Pay Configuration</p>
        <div className="space-y-1 text-[10px] text-muted-foreground">
          <div className="flex justify-between">
            <span>Base per class</span>
            <span className="font-medium text-foreground">$45</span>
          </div>
          <div className="flex justify-between">
            <span>Per student bonus</span>
            <span className="font-medium text-foreground">$3</span>
          </div>
          <div className="flex justify-between">
            <span>High occupancy bonus (&gt;80%)</span>
            <span className="font-medium text-foreground">+$15</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MockMarketing() {
  return (
    <div className="rounded-xl border border-border bg-white p-4 space-y-3">
      <div className="rounded-lg bg-surface p-3">
        <p className="text-[10px] font-semibold text-foreground mb-2">Campaign Performance</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Total Clicks", value: "2,340" },
            { label: "Conversions", value: "186" },
            { label: "Conv. Rate", value: "7.9%" },
          ].map((m) => (
            <div key={m.label} className="text-center">
              <p className="text-lg font-bold text-foreground">{m.value}</p>
              <p className="text-[10px] text-muted-foreground">{m.label}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {[
          { name: "Summer HIIT Launch", clicks: "890", conv: "72", source: "Instagram" },
          { name: "Refer-a-Friend", clicks: "654", conv: "58", source: "Referral" },
          { name: "New Year Yoga", clicks: "796", conv: "56", source: "QR Code" },
        ].map((c) => (
          <div
            key={c.name}
            className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-xs"
          >
            <div>
              <span className="font-medium text-foreground">{c.name}</span>
              <span className="ml-2 text-muted-foreground">{c.source}</span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span>{c.clicks} clicks</span>
              <span className="font-medium text-accent">{c.conv} conv.</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WhyMgic() {
  const t = useTranslations("marketing");
  const tabs = t.raw("whyMgic.tabs") as Tab[];
  const [activeTab, setActiveTab] = useState(tabs[0].id);
  const active = tabs.find((tab) => tab.id === activeTab)!;
  const MockComponent = mockUIByTab[active.id] ?? MockSchedule;

  return (
    <section id="why-mgic" className="py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto max-w-2xl text-center mb-12"
        >
          <p className="text-sm font-semibold text-accent mb-3">{t("whyMgic.label")}</p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">
            {t("whyMgic.titleStart")}
            <em className="not-italic text-gradient">{t("whyMgic.titleEmphasis")}</em>
            {t("whyMgic.titleEnd")}
          </h2>
          <p className="mt-4 text-lg text-muted">{t("whyMgic.subtitle")}</p>
        </motion.div>

        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-5 py-2.5 text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-foreground text-white shadow-lg"
                  : "bg-surface text-muted hover:bg-border/60"
              }`}
            >
              {tab.title}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="grid md:grid-cols-2 gap-10 items-start"
          >
            <div className="space-y-6">
              <h3 className="text-2xl sm:text-3xl font-bold text-foreground">{active.headline}</h3>
              <p className="text-base text-muted leading-relaxed">{active.description}</p>
              <ul className="space-y-3">
                {active.features.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10">
                      <svg
                        className="h-3 w-3 text-accent"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    <span className="text-sm text-muted">{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <MockComponent />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
