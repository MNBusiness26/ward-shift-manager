import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export function useAppSettings() {
  const { data: settings = [] } = useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("*");
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  const getSetting = (key: string) => settings.find((s: any) => s.key === key)?.value;

  const enforceFullWeek = (() => {
    const v = getSetting("enforce_full_week");
    return v === "true" || v === true;
  })();

  const headcountLimits = (() => {
    const v = getSetting("headcount_limits");
    if (v && typeof v === "object") {
      return v as { morning: number; evening: number; night: number };
    }
    return { morning: 4, evening: 3, night: 2 };
  })();

  return { enforceFullWeek, headcountLimits, settings };
}
