import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { getTenant } from "@/lib/tenant";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;

  let locale = cookieLocale;

  if (!locale) {
    try {
      const tenant = await getTenant();
      locale = tenant?.locale ?? "es";
    } catch {
      locale = "es";
    }
  }

  if (locale !== "en" && locale !== "es") {
    locale = "es";
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
