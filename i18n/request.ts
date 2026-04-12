import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { getTenant } from "@/lib/tenant";

const SUPPORTED = new Set(["en", "es"]);

function detectFromAcceptLanguage(header: string): string | undefined {
  for (const part of header.split(",")) {
    const lang = part.split(";")[0].trim().toLowerCase();
    if (lang.startsWith("en")) return "en";
    if (lang.startsWith("es")) return "es";
  }
  return undefined;
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;

  let locale = cookieLocale;

  if (!locale || !SUPPORTED.has(locale)) {
    try {
      const tenant = await getTenant();
      locale = tenant?.locale ?? undefined;
    } catch {
      // ignore
    }
  }

  if (!locale || !SUPPORTED.has(locale)) {
    const h = await headers();
    const acceptLang = h.get("accept-language");
    if (acceptLang) locale = detectFromAcceptLanguage(acceptLang);
  }

  if (!locale || !SUPPORTED.has(locale)) {
    locale = "es";
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
