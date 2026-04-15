import { useContext } from "react";
import { I18nContext } from "./I18nProvider";
import translations from "./translations.json";

type Locale = keyof typeof translations;
type TranslationKey = keyof typeof translations.en;

export function useTranslation() {
  const ctx = useContext(I18nContext);
  const locale: Locale = ctx?.locale ?? "en";
  const dict = translations[locale] ?? translations.en;

  const t = (key: TranslationKey | string): string => {
    return (dict as Record<string, string>)[key] ?? (translations.en as Record<string, string>)[key] ?? key;
  };

  return { t, locale, setLocale: ctx?.setLocale ?? (() => {}), dir: locale === "he" ? "rtl" as const : "ltr" as const };
}
