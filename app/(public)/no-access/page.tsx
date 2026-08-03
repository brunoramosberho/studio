import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Where the staff portals send someone who is signed in but isn't staff here.
 *
 * Being explicit matters: the alternative is an empty dashboard where every
 * section 403s, which reads as a broken product rather than a closed door.
 */
export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ portal?: string }>;
}) {
  const { portal } = await searchParams;
  const t = await getTranslations("auth.noAccess");

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/10">
        <ShieldOff className="h-6 w-6 text-muted" />
      </div>
      <h1 className="mt-5 text-xl font-semibold">{t("title")}</h1>
      <p className="mt-2 text-sm text-muted">
        {portal === "coach" ? t("bodyCoach") : t("bodyAdmin")}
      </p>
      <div className="mt-6 flex flex-col gap-2 self-stretch">
        <Button asChild>
          <Link href="/my">{t("goToMember")}</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/login?portal=admin">{t("switchAccount")}</Link>
        </Button>
      </div>
    </div>
  );
}
