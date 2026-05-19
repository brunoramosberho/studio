import { es, enUS, type Locale } from "date-fns/locale";

/**
 * Resolve a date-fns locale from the next-intl locale string. Centralized
 * so date-fns formatting matches whatever the user's UI locale is, instead
 * of being hardcoded to Spanish.
 *
 * Add new mappings here when we ship new languages.
 */
export function getDateFnsLocale(intlLocale: string): Locale {
  switch (intlLocale) {
    case "en":
      return enUS;
    case "es":
    default:
      return es;
  }
}
