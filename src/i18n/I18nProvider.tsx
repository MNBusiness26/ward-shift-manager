import { createContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import translations from "./translations.json";

type Locale = "en" | "he";
type Dict = Record<string, string>;

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  dict: Dict;
  applyOverride: (key: string, value: string) => void;
  removeOverride: (key: string) => void;
  refreshOverrides: () => Promise<void>;
}

export const I18nContext = createContext<I18nContextType | null>(null);

function buildDict(locale: Locale, overrides: Dict): Dict {
  const base = (translations as Record<string, Dict>)[locale] ?? {};
  return { ...base, ...overrides };
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(
    () => (localStorage.getItem("wardwise-locale") as Locale) || "en"
  );
  const [overrides, setOverrides] = useState<Dict>({});
  const [dict, setDict] = useState<Dict>(() => buildDict(locale, {}));

  useEffect(() => {
    const dir = locale === "he" ? "rtl" : "ltr";
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", locale);
  }, [locale]);

  const fetchOverrides = useCallback(async (loc: Locale) => {
    const { data, error } = await supabase
      .from("translation_overrides")
      .select("key,value")
      .eq("locale", loc);
    if (error) {
      console.error("Failed to load translation overrides", error);
      setOverrides({});
      setDict(buildDict(loc, {}));
      return;
    }
    const map: Dict = {};
    (data ?? []).forEach((row) => {
      map[row.key] = row.value;
    });
    setOverrides(map);
    setDict(buildDict(loc, map));
  }, []);

  useEffect(() => {
    fetchOverrides(locale);
  }, [locale, fetchOverrides]);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("wardwise-locale", l);
  };

  const applyOverride = (key: string, value: string) => {
    setOverrides((prev) => {
      const next = { ...prev, [key]: value };
      setDict(buildDict(locale, next));
      return next;
    });
  };

  const removeOverride = (key: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      setDict(buildDict(locale, next));
      return next;
    });
  };

  const refreshOverrides = useCallback(() => fetchOverrides(locale), [fetchOverrides, locale]);

  return (
    <I18nContext.Provider
      value={{ locale, setLocale, dict, applyOverride, removeOverride, refreshOverrides }}
    >
      {children}
    </I18nContext.Provider>
  );
}
