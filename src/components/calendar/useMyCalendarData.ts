import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

export type Shift = Database["public"]["Tables"]["shifts"]["Row"];

export function useMyShifts(rangeStart: Date, rangeEnd: Date) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-shifts", user?.id, format(rangeStart, "yyyy-MM-dd"), format(rangeEnd, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .eq("assigned_user_id", user!.id)
        .gte("date", format(rangeStart, "yyyy-MM-dd"))
        .lte("date", format(rangeEnd, "yyyy-MM-dd"))
        .order("date")
        .order("start_time");
      if (error) throw error;
      return data as Shift[];
    },
    enabled: !!user,
  });
}

export function useMyRole() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-roles", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data.map((r) => r.role);
    },
    enabled: !!user,
  });
}

export function useDayShifts(dateStr: string | null) {
  return useQuery({
    queryKey: ["day-all-shifts", dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*, profiles:assigned_user_id(full_name, is_responsible)")
        .eq("date", dateStr!)
        .not("assigned_user_id", "is", null)
        .order("start_time");
      if (error) throw error;
      return data;
    },
    enabled: !!dateStr,
  });
}
