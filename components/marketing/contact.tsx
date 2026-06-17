"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

type Status = "idle" | "submitting" | "success" | "error";

export function MarketingContact() {
  const t = useTranslations("marketing");
  const studioTypeOptions = t.raw("contact.form.studioTypeOptions") as string[];
  const sizeOptions = t.raw("contact.form.sizeOptions") as string[];

  const [status, setStatus] = useState<Status>("idle");
  const [form, setForm] = useState({
    name: "",
    email: "",
    studioType: "",
    size: "",
    link: "",
    company: "", // honeypot
  });

  const set = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    try {
      const res = await fetch("/api/marketing/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("request failed");
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  const inputClass =
    "w-full rounded-xl border border-white/15 bg-white/5 px-4 h-12 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors";

  return (
    <section
      id="contact"
      className="py-20 md:py-28 bg-foreground relative overflow-hidden scroll-mt-20"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-foreground via-foreground to-accent/20 pointer-events-none" />

      <div className="relative mx-auto max-w-xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10"
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
          <p className="mx-auto mt-5 max-w-md text-lg text-white/60">
            {t("contact.subtitle")}
          </p>
        </motion.div>

        {status === "success" ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border border-white/15 bg-white/5 p-10 text-center"
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent">
              <svg
                className="h-6 w-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-xl font-bold text-white">
              {t("contact.form.successTitle")}
            </p>
            <p className="mt-2 text-white/60">{t("contact.form.successBody")}</p>
          </motion.div>
        ) : (
          <motion.form
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            onSubmit={onSubmit}
            className="space-y-3"
          >
            {/* honeypot */}
            <input
              type="text"
              name="company"
              value={form.company}
              onChange={set("company")}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
            />

            <input
              type="text"
              required
              value={form.name}
              onChange={set("name")}
              placeholder={t("contact.form.namePlaceholder")}
              aria-label={t("contact.form.name")}
              className={inputClass}
            />
            <input
              type="email"
              required
              value={form.email}
              onChange={set("email")}
              placeholder={t("contact.form.emailPlaceholder")}
              aria-label={t("contact.form.email")}
              className={inputClass}
            />

            <div className="grid sm:grid-cols-2 gap-3">
              <select
                required
                value={form.studioType}
                onChange={set("studioType")}
                aria-label={t("contact.form.studioType")}
                className={`${inputClass} ${form.studioType ? "" : "text-white/40"}`}
              >
                <option value="" disabled className="text-foreground">
                  {t("contact.form.studioTypePlaceholder")}
                </option>
                {studioTypeOptions.map((o) => (
                  <option key={o} value={o} className="text-foreground">
                    {o}
                  </option>
                ))}
              </select>

              <select
                required
                value={form.size}
                onChange={set("size")}
                aria-label={t("contact.form.size")}
                className={`${inputClass} ${form.size ? "" : "text-white/40"}`}
              >
                <option value="" disabled className="text-foreground">
                  {t("contact.form.sizePlaceholder")}
                </option>
                {sizeOptions.map((o) => (
                  <option key={o} value={o} className="text-foreground">
                    {o}
                  </option>
                ))}
              </select>
            </div>

            <input
              type="text"
              value={form.link}
              onChange={set("link")}
              placeholder={t("contact.form.linkPlaceholder")}
              aria-label={t("contact.form.link")}
              className={inputClass}
            />

            <button
              type="submit"
              disabled={status === "submitting"}
              className="btn-gradient inline-flex h-12 w-full items-center justify-center rounded-xl text-base font-semibold shadow-lg shadow-accent/25 disabled:opacity-60"
            >
              {status === "submitting"
                ? t("contact.form.submitting")
                : t("contact.form.submit")}
            </button>

            {status === "error" && (
              <p className="text-center text-sm text-red-300">
                {t("contact.form.errorGeneric")}
              </p>
            )}
          </motion.form>
        )}
      </div>
    </section>
  );
}
