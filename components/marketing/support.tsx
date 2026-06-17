"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

type Card = { title: string; desc: string; image: string };

export function MarketingSupport() {
  const t = useTranslations("marketing");
  const cards = t.raw("support.cards") as Card[];

  return (
    <section className="py-20 md:py-28 bg-surface/50">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto max-w-2xl text-center mb-14"
        >
          <p className="text-sm font-semibold text-accent mb-3">
            {t("support.label")}
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">
            {t("support.titleStart")}
            <em className="not-italic text-gradient">{t("support.titleEmphasis")}</em>
            {t("support.titleEnd")}
          </h2>
          <p className="mt-4 text-lg text-muted">{t("support.subtitle")}</p>
        </motion.div>

        <div className="grid sm:grid-cols-3 gap-6">
          {cards.map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="rounded-2xl border border-border bg-white overflow-hidden shadow-sm"
            >
              <div className="relative h-48 overflow-hidden bg-surface">
                <Image
                  src={card.image}
                  alt={card.title}
                  fill
                  sizes="(min-width: 640px) 33vw, 100vw"
                  className="object-cover"
                />
              </div>
              <div className="p-6">
                <h3 className="text-base font-bold text-foreground">{card.title}</h3>
                <p className="mt-2 text-sm text-muted leading-relaxed">{card.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
