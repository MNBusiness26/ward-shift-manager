import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type HolidayCategory = "jewish" | "muslim" | "christian" | "national" | "ward";

export interface PublicHoliday {
  id: string;
  date: string; // yyyy-mm-dd
  name_he: string;
  name_en: string;
  category: HolidayCategory;
  is_eve: boolean;
  is_active: boolean;
  source: string;
  hebcal_uid: string | null;
}

export interface LocalizationSettings {
  region: string;
  enabled_categories: Record<HolidayCategory, boolean>;
}

export const DEFAULT_LOCALIZATION: LocalizationSettings = {
  region: "IL",
  enabled_categories: {
    jewish: true,
    muslim: true,
    christian: true,
    national: true,
    ward: true,
  },
};

export function useLocalizationSettings() {
  return useQuery({
    queryKey: ["app-setting", "localization"],
    queryFn: async (): Promise<LocalizationSettings> => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "localization")
        .maybeSingle();
      const v = (data?.value as any) || {};
      return {
        region: v.region || DEFAULT_LOCALIZATION.region,
        enabled_categories: { ...DEFAULT_LOCALIZATION.enabled_categories, ...(v.enabled_categories || {}) },
      };
    },
    staleTime: 60_000,
  });
}

export function usePublicHolidays() {
  return useQuery({
    queryKey: ["public-holidays"],
    queryFn: async (): Promise<PublicHoliday[]> => {
      const { data, error } = await supabase
        .from("public_holidays")
        .select("*")
        .order("date", { ascending: true });
      if (error) throw error;
      return (data || []) as PublicHoliday[];
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Build a date->holiday lookup map honoring active flag and category filters.
 * Returns the highest-priority holiday for each date (Chag wins over Eve when same day).
 */
const PRIORITY: HolidayCategory[] = ["national", "jewish", "muslim", "christian", "ward"];

export function useHolidayMap() {
  const { data: settings } = useLocalizationSettings();
  const { data: holidays = [] } = usePublicHolidays();
  const enabled = settings?.enabled_categories || DEFAULT_LOCALIZATION.enabled_categories;

  const map = new Map<string, PublicHoliday>();
  for (const h of holidays) {
    if (!h.is_active) continue;
    if (!enabled[h.category]) continue;
    const existing = map.get(h.date);
    if (!existing) {
      map.set(h.date, h);
    } else {
      // Chag wins over Eve on same date
      const existingIsChag = !existing.is_eve;
      const newIsChag = !h.is_eve;
      if (newIsChag && !existingIsChag) {
        map.set(h.date, h);
      } else if (newIsChag === existingIsChag) {
        // Both same eve-ness → use category priority
        const ep = PRIORITY.indexOf(existing.category);
        const np = PRIORITY.indexOf(h.category);
        if (np < ep) map.set(h.date, h);
      }
    }
  }
  return map;
}
