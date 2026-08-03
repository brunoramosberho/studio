import { getTranslations } from "next-intl/server";
import { Ban } from "lucide-react";
import { getTenant } from "@/lib/tenant";

/**
 * Where a blocked member lands instead of the member portal.
 *
 * Deliberately says nothing about why. The reason an admin types is an
 * internal note — it can be blunt, or reference an incident the studio would
 * rather handle in person — so it stays in the admin panel.
 */
export default async function BlockedPage() {
  const t = await getTranslations("member.blocked");
  const tenant = await getTenant();

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/10">
        <Ban className="h-6 w-6 text-muted" />
      </div>
      <h1 className="mt-5 text-xl font-semibold">{t("title")}</h1>
      <p className="mt-2 text-sm text-muted">
        {t("body", { studio: tenant?.name ?? "" })}
      </p>
      <p className="mt-4 text-xs text-muted/70">{t("contact")}</p>
    </div>
  );
}
