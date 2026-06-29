"use client";

import { useLocale, useTranslations } from "next-intl";

/**
 * Official "Add to Apple Wallet" badge. Apple requires using their exact
 * artwork — no recreating, recoloring, animating, dimming, or adding effects.
 * We just serve the official SVG (localized es/en) inside a plain anchor so iOS
 * Safari triggers the Wallet "add pass" sheet from the `.pkpass` download.
 * Render only for Apple platforms + active members.
 */
export function AddToAppleWalletButton({
  href = "/api/wallet/apple-pass",
  className = "",
}: {
  href?: string;
  className?: string;
}) {
  const t = useTranslations("wallet");
  const locale = useLocale();
  const badge =
    locale === "es"
      ? "/wallet/add-to-apple-wallet-es.svg"
      : "/wallet/add-to-apple-wallet-en.svg";

  return (
    <a href={href} aria-label={t("addToAppleWallet")} className={`inline-block ${className}`}>
      {/* Official Apple artwork — must stay unmodified (no recolor/animate/dim). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={badge}
        alt={t("addToAppleWallet")}
        className="h-11 w-auto select-none"
        draggable={false}
      />
    </a>
  );
}
