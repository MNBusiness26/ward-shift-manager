import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FrictionCheckKey =
  | "fte_weekly"
  | "excluded_shifts"
  | "excluded_days"
  | "rest_period"
  | "headcount"
  | "consecutive_weekend";

export interface FrictionCheckConfig {
  enabled: boolean;
  severity: "yellow" | "red";
  min_hours?: number;
}

export interface FrictionConfig {
  enabled: boolean;
  log_when_disabled: boolean;
  fte_shifts_per_week: number;
  checks: Record<FrictionCheckKey, FrictionCheckConfig>;
}

export const DEFAULT_FRICTION_CONFIG: FrictionConfig = {
  enabled: true,
  log_when_disabled: true,
  fte_shifts_per_week: 5,
  checks: {
    fte_weekly: { enabled: true, severity: "yellow" },
    excluded_shifts: { enabled: true, severity: "yellow" },
    excluded_days: { enabled: true, severity: "yellow" },
    rest_period: { enabled: true, severity: "red", min_hours: 8 },
    headcount: { enabled: true, severity: "yellow" },
  },
};

function mergeConfig(raw: any): FrictionConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_FRICTION_CONFIG;
  const checks = { ...DEFAULT_FRICTION_CONFIG.checks } as FrictionConfig["checks"];
  if (raw.checks && typeof raw.checks === "object") {
    for (const key of Object.keys(checks) as FrictionCheckKey[]) {
      checks[key] = { ...checks[key], ...(raw.checks[key] ?? {}) };
    }
  }
  return {
    enabled: raw.enabled ?? DEFAULT_FRICTION_CONFIG.enabled,
    log_when_disabled: raw.log_when_disabled ?? DEFAULT_FRICTION_CONFIG.log_when_disabled,
    fte_shifts_per_week: Number(raw.fte_shifts_per_week ?? DEFAULT_FRICTION_CONFIG.fte_shifts_per_week),
    checks,
  };
}

export function useFrictionConfig() {
  const { data } = useQuery({
    queryKey: ["app-settings", "friction_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "friction_config")
        .maybeSingle();
      if (error) throw error;
      return mergeConfig(data?.value);
    },
    staleTime: 30_000,
  });
  return data ?? DEFAULT_FRICTION_CONFIG;
}
