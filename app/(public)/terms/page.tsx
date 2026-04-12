import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const COMPANY = "Magic Payments España SL";

export default async function TermsPage() {
  const t = await getTranslations("legal");

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("backToHome")}
      </Link>

      <h1 className="font-display text-3xl font-bold text-foreground">
        {t("termsTitle")}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {t("lastUpdated", { date: "2026-04-12" })}
      </p>

      <div className="prose prose-sm prose-zinc mt-8 max-w-none [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-3 [&_p]:text-muted [&_p]:leading-relaxed [&_li]:text-muted [&_ul]:space-y-1">
        <h2>{t("termsAcceptance")}</h2>
        <p>{t("termsAcceptanceDesc", { company: COMPANY })}</p>

        <h2>{t("termsService")}</h2>
        <p>{t("termsServiceDesc", { company: COMPANY })}</p>

        <h2>{t("termsAccount")}</h2>
        <p>{t("termsAccountDesc")}</p>

        <h2>{t("termsBookings")}</h2>
        <p>{t("termsBookingsDesc")}</p>
        <ul>
          <li>{t("termsBookingsCancel")}</li>
          <li>{t("termsBookingsCredits")}</li>
          <li>{t("termsBookingsNoShow")}</li>
        </ul>

        <h2>{t("termsPayments")}</h2>
        <p>{t("termsPaymentsDesc")}</p>

        <h2>{t("termsConduct")}</h2>
        <p>{t("termsConductDesc")}</p>

        <h2>{t("termsLiability")}</h2>
        <p>{t("termsLiabilityDesc", { company: COMPANY })}</p>

        <h2>{t("termsChanges")}</h2>
        <p>{t("termsChangesDesc")}</p>

        <h2>{t("termsContact")}</h2>
        <p>{t("termsContactDesc", { company: COMPANY })}</p>
      </div>
    </div>
  );
}
