"use client";

import { useTranslations } from "next-intl";

const CONTACT_EMAIL = "bruno@mgic.me";

export function MarketingFooter() {
  const t = useTranslations("marketing");
  const copyright = t("footer.copyright", { year: new Date().getFullYear() });

  return (
    <footer className="border-t border-border bg-white">
      <div className="mx-auto max-w-6xl px-6 lg:px-8 py-12">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="max-w-sm">
            <a href="#" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg btn-gradient">
                <span className="text-sm font-extrabold text-white">M</span>
              </div>
              <span className="text-lg font-bold tracking-tight text-foreground">
                mgic
              </span>
            </a>
            <p className="mt-3 text-sm text-muted leading-relaxed">
              {t("footer.tagline")}
            </p>
          </div>

          <nav className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <a
              href="#pricing"
              className="text-muted hover:text-foreground transition-colors"
            >
              {t("nav.pricing")}
            </a>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-muted hover:text-foreground transition-colors"
            >
              {t("footer.contactLabel")}
            </a>
            <a
              href="/terms"
              className="text-muted hover:text-foreground transition-colors"
            >
              {t("footer.terms")}
            </a>
            <a
              href="/privacy"
              className="text-muted hover:text-foreground transition-colors"
            >
              {t("footer.privacy")}
            </a>
          </nav>
        </div>

        <div className="mt-10 pt-6 border-t border-border">
          <p className="text-xs text-muted-foreground">{copyright}</p>
        </div>
      </div>
    </footer>
  );
}
