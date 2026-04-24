"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

interface Plan {
  name: string;
  monthly: string;
  annual: string;
  platformFee: string;
  onboarding: string;
  description: string;
  features: string[];
  highlight?: string;
}

export function MarketingPricing() {
  const t = useTranslations("marketing");
  const [annual, setAnnual] = useState(false);
  const plans = t.raw("pricing.plans") as Plan[];

  return (
    <section id="pricing" className="py-20 md:py-28 bg-surface/50">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto max-w-2xl text-center mb-10"
        >
          <p className="text-sm font-semibold text-accent mb-3">{t("pricing.label")}</p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">
            {t("pricing.titleStart")}
            <em className="not-italic text-gradient">{t("pricing.titleEmphasis")}</em>
          </h2>
          <p className="mt-4 text-lg text-muted">{t("pricing.subtitle")}</p>
        </motion.div>

        <div className="flex items-center justify-center gap-3 mb-12">
          <span className={`text-sm font-medium ${!annual ? "text-foreground" : "text-muted"}`}>
            {t("pricing.monthly")}
          </span>
          <button
            onClick={() => setAnnual(!annual)}
            className={`relative h-7 w-12 rounded-full transition-colors ${annual ? "bg-accent" : "bg-border"}`}
            aria-label={t("pricing.toggleAriaLabel")}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                annual ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
          <span className={`text-sm font-medium ${annual ? "text-foreground" : "text-muted"}`}>
            {t("pricing.annual")}
          </span>
          {annual && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              {t("pricing.saveBadge")}
            </span>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan, i) => {
            const highlighted = plan.name === "Growth";
            return (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className={`relative rounded-2xl border p-6 md:p-7 flex flex-col ${
                  highlighted
                    ? "border-accent bg-white shadow-xl shadow-accent/10 ring-1 ring-accent/20"
                    : "border-border bg-white"
                }`}
              >
                {highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-4 py-1 text-xs font-semibold text-white whitespace-nowrap">
                    {t("pricing.mostPopular")}
                  </div>
                )}

                <p className="text-sm font-semibold text-muted">{plan.name}</p>

                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-foreground">
                    €{annual ? plan.annual : plan.monthly}
                  </span>
                  <span className="text-base text-muted">EUR{t("pricing.perMonth")}</span>
                </div>

                <div className="mt-2 space-y-0.5">
                  <p className="text-xs text-muted-foreground">+ {plan.platformFee}</p>
                  <p className="text-xs text-muted-foreground">{plan.onboarding}</p>
                </div>

                {plan.highlight && (
                  <div className="mt-3 rounded-lg bg-accent/5 border border-accent/15 px-3 py-2">
                    <p className="text-[11px] text-accent font-medium leading-relaxed">
                      ⚡ {plan.highlight}
                    </p>
                  </div>
                )}

                <div className="my-5 h-px bg-border" />

                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <svg
                        className={`h-4 w-4 mt-0.5 shrink-0 ${
                          highlighted ? "text-accent" : "text-foreground"
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-muted">{f}</span>
                    </li>
                  ))}
                </ul>

                <a
                  href="#cta"
                  className={`inline-flex h-11 items-center justify-center rounded-full text-sm font-semibold transition-all hover:-translate-y-0.5 gap-1 ${
                    highlighted
                      ? "btn-gradient shadow-lg shadow-accent/25"
                      : "border border-border bg-white text-foreground hover:bg-surface"
                  }`}
                >
                  {t("pricing.bookDemo")}
                  <span className="ml-1">→</span>
                </a>
              </motion.div>
            );
          })}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-8 text-center text-sm text-muted-foreground"
        >
          {t("pricing.footerNote")}
        </motion.p>
      </div>
    </section>
  );
}
