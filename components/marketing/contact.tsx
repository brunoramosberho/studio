"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

const CONTACT_EMAIL = "bruno@mgic.me";

export function MarketingContact() {
  const t = useTranslations("marketing");

  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
    t("contact.mailSubject")
  )}&body=${encodeURIComponent(t("contact.mailBody"))}`;

  return (
    <section
      id="contact"
      className="py-20 md:py-28 bg-foreground relative overflow-hidden scroll-mt-20"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-foreground via-foreground to-accent/20 pointer-events-none" />

      <div className="relative mx-auto max-w-3xl px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-sm font-semibold text-accent mb-3">
            {t("contact.label")}
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white">
            {t("contact.titleStart")}
            <em className="not-italic text-gradient">
              {t("contact.titleEmphasis")}
            </em>
            {t("contact.titleEnd")}
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-white/60">
            {t("contact.subtitle")}
          </p>

          <div className="mt-10 flex justify-center">
            <a
              href={mailto}
              className="btn-gradient inline-flex h-12 items-center rounded-full px-8 text-base font-semibold shadow-lg shadow-accent/25"
            >
              {t("contact.ctaPrimary")}
            </a>
          </div>

          <p className="mt-6 text-sm text-white/40">
            {t("contact.emailLabel")}{" "}
            <a
              href={mailto}
              className="font-medium text-white/70 underline underline-offset-4 hover:text-white"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
        </motion.div>
      </div>
    </section>
  );
}
