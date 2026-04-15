import { createContext, useState, ReactNode } from "react";

type Locale = "en" | "he";

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

export const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(
    () => (localStorage.getItem("wardwise-locale") as Locale) || "en"
  );

  const handleSet = (l: Locale) => {
    setLocale(l);
    localStorage.setItem("wardwise-locale", l);
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale: handleSet }}>
      {children}
    </I18nContext.Provider>
  );
}
