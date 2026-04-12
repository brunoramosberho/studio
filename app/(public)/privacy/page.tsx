import { getTranslations } from "next-intl/server";
import { getServerBranding } from "@/lib/branding.server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function PrivacyPage() {
  const t = await getTranslations("legal");
  const b = await getServerBranding();
  const studioName = `${b.studioName} Studio`;

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
        {t("privacyTitle")}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {t("lastUpdated", { date: "2026-04-12" })}
      </p>

      <div className="prose prose-sm prose-zinc mt-8 max-w-none [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-3 [&_p]:text-muted [&_p]:leading-relaxed [&_li]:text-muted [&_ul]:space-y-1">
        <h2>{t("privacyWhoWeAre")}</h2>
        <p>{t("privacyWhoWeAreDesc", { studioName })}</p>

        <h2>{t("privacyDataCollected")}</h2>
        <p>{t("privacyDataCollectedDesc")}</p>
        <ul>
          <li>{t("privacyDataName")}</li>
          <li>{t("privacyDataEmail")}</li>
          <li>{t("privacyDataPhone")}</li>
          <li>{t("privacyDataBirthday")}</li>
          <li>{t("privacyDataBookings")}</li>
          <li>{t("privacyDataPayment")}</li>
        </ul>

        <h2>{t("privacyPurpose")}</h2>
        <p>{t("privacyPurposeDesc")}</p>
        <ul>
          <li>{t("privacyPurposeBookings")}</li>
          <li>{t("privacyPurposeComms")}</li>
          <li>{t("privacyPurposePayments")}</li>
          <li>{t("privacyPurposeImprove")}</li>
        </ul>

        <h2>{t("privacySharing")}</h2>
        <p>{t("privacySharingDesc")}</p>

        <h2>{t("privacyCookies")}</h2>
        <p>{t("privacyCookiesDesc")}</p>

        <h2>{t("privacyRights")}</h2>
        <p>{t("privacyRightsDesc")}</p>

        <h2>{t("privacyContact")}</h2>
        <p>{t("privacyContactDesc", { studioName })}</p>
      </div>
    </div>
  );
}
