import { useContext } from "react";
import { I18nContext } from "./I18nProvider";
import translations from "./translations.json";

type Locale = keyof typeof translations;
type TranslationKey = keyof typeof translations.en;

export function useTranslation() {
  const ctx = useContext(I18nContext);
  const locale: Locale = (ctx?.locale ?? "en") as Locale;
  const dict = ctx?.dict ?? (translations.en as Record<string, string>);

  const t = (key: TranslationKey | string): string => {
    return dict[key] ?? (translations.en as Record<string, string>)[key] ?? key;
  };

  return {
    t,
    locale,
    setLocale: ctx?.setLocale ?? (() => {}),
    dir: locale === "he" ? ("rtl" as const) : ("ltr" as const),
    applyOverride: ctx?.applyOverride ?? (() => {}),
    removeOverride: ctx?.removeOverride ?? (() => {}),
    refreshOverrides: ctx?.refreshOverrides ?? (async () => {}),
  };
}
