"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

type Card = { title: string; desc: string; image: string };

export function SwitchingCost() {
  const t = useTranslations("marketing");
  const main = t.raw("switching.cards.main") as Omit<Card, "image">;
  const owners: Card = {
    ...(t.raw("switching.cards.owners") as Omit<Card, "image">),
    image: "/marketing/owners.jpg",
  };
  const bottomCards: Card[] = [
    { ...(t.raw("switching.cards.support") as Omit<Card, "image">), image: "/marketing/support.jpg" },
    { ...(t.raw("switching.cards.aiDesk") as Omit<Card, "image">), image: "/marketing/ai-desk.jpg" },
    { ...(t.raw("switching.cards.buyout") as Omit<Card, "image">), image: "/marketing/buyout.jpg" },
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
            <div className="relative h-48 overflow-hidden">
              <Image
                src={owners.image}
                alt={owners.title}
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-cover"
              />
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
              <div className="relative h-44 overflow-hidden bg-surface">
                <Image
                  src={card.image}
                  alt={card.title}
                  fill
                  sizes="(min-width: 640px) 33vw, 100vw"
                  className="object-cover"
                />
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
