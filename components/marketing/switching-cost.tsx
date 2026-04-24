"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

type Card = { title: string; desc: string };

function ImagePlaceholder({ label }: { label: string }) {
  return (
    <div className="w-full h-full min-h-[180px] rounded-xl bg-gradient-to-br from-surface via-border/30 to-surface flex items-center justify-center">
      <div className="text-center px-4">
        <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center">
          <svg className="h-6 w-6 text-accent/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
        </div>
        <p className="text-[10px] text-muted-foreground/60">{label}</p>
      </div>
    </div>
  );
}

export function SwitchingCost() {
  const t = useTranslations("marketing");
  const main = t.raw("switching.cards.main") as Card;
  const owners = t.raw("switching.cards.owners") as Card;
  const bottomCards: Card[] = [
    t.raw("switching.cards.support") as Card,
    t.raw("switching.cards.aiDesk") as Card,
    t.raw("switching.cards.buyout") as Card,
  ];

  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto max-w-3xl text-center mb-6"
        >
          <div className="inline-flex items-center rounded-full border border-border bg-white px-4 py-1.5 text-sm font-medium text-muted mb-6">
            {t("switching.badge")}
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground">
            {t("switching.titleStart")}
            <em className="not-italic text-gradient">{t("switching.titleEmphasis")}</em>
          </h2>
          <p className="mt-4 text-lg text-muted max-w-2xl mx-auto">
            {t("switching.subtitleStart")}
            <strong className="text-foreground">{t("switching.subtitleEmphasis")}</strong>
            {t("switching.subtitleEnd")}
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-5 mb-5">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="rounded-2xl border border-border bg-white p-6 md:p-8"
          >
            <div className="flex items-center gap-3 mb-6">
              {["🏢", "🌙", "⚡"].map((icon, i) => (
                <div key={i} className={`h-10 w-10 rounded-full bg-surface flex items-center justify-center text-lg ${
                  i > 0 ? "-ml-2 ring-2 ring-white" : ""
                }`}>
                  {icon}
                </div>
              ))}
              <span className="ml-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t("switching.oneNightLabel")}
              </span>
            </div>
            <h3 className="text-lg font-bold text-foreground">{main.title}</h3>
            <p className="mt-2 text-sm text-muted leading-relaxed">{main.desc}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="rounded-2xl border border-border bg-white overflow-hidden"
          >
            <div className="h-48 overflow-hidden">
              <ImagePlaceholder label={owners.title} />
            </div>
            <div className="p-6">
              <h3 className="text-lg font-bold text-foreground">{owners.title}</h3>
              <p className="mt-2 text-sm text-muted leading-relaxed">{owners.desc}</p>
            </div>
          </motion.div>
        </div>

        <div className="grid sm:grid-cols-3 gap-5">
          {bottomCards.map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="rounded-2xl border border-border bg-white overflow-hidden"
            >
              <div className="h-44 overflow-hidden">
                <ImagePlaceholder label={card.title} />
              </div>
              <div className="p-5">
                <h3 className="text-base font-bold text-foreground">{card.title}</h3>
                <p className="mt-1.5 text-sm text-muted leading-relaxed">{card.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-12 text-center"
        >
          <div className="inline-flex items-center gap-3 sm:gap-6 text-sm sm:text-base font-semibold text-foreground">
            <span>{t("switching.bullets.freeTrial")}</span>
            <span className="h-1 w-1 rounded-full bg-accent" />
            <span>{t("switching.bullets.buyout")}</span>
            <span className="h-1 w-1 rounded-full bg-accent" />
            <span>{t("switching.bullets.migration")}</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
