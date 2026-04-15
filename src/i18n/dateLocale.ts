import { format as dateFnsFormat } from "date-fns";
import { he } from "date-fns/locale/he";

const localeMap: Record<string, Locale> = { he };

/**
 * Locale-aware wrapper around date-fns `format`.
 * Pass the current locale string ("en" | "he") and it will
 * automatically use the correct date-fns locale object.
 * For data-only formats (e.g. "yyyy-MM-dd") you can omit locale.
 */
export function formatLocale(
  date: Date | number,
  formatStr: string,
  locale?: string,
): string {
  const opts = locale && localeMap[locale] ? { locale: localeMap[locale] } : undefined;
  return dateFnsFormat(date, formatStr, opts);
}
