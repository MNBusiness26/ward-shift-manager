import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

export type Shift = Database["public"]["Tables"]["shifts"]["Row"];

export function useMyShifts(rangeStart: Date, rangeEnd: Date) {
  const { profile } = useAuth();
  const userId = profile?.id;
  return useQuery({
    queryKey: ["my-shifts", userId, format(rangeStart, "yyyy-MM-dd"), format(rangeEnd, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .eq("assigned_user_id", userId!)
        .gte("date", format(rangeStart, "yyyy-MM-dd"))
        .lte("date", format(rangeEnd, "yyyy-MM-dd"))
        .order("date")
        .order("start_time");
      if (error) throw error;
      return data as Shift[];
    },
    enabled: !!userId,
  });
}

export function useMyRole() {
  const { profile } = useAuth();
  const userId = profile?.id;
  return useQuery({
    queryKey: ["my-roles", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!);
      if (error) throw error;
      return data.map((r) => r.role);
    },
    enabled: !!userId,
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

export function useAllShiftsInRange(rangeStart: Date, rangeEnd: Date) {
  return useQuery({
    queryKey: ["all-shifts-range", format(rangeStart, "yyyy-MM-dd"), format(rangeEnd, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("id, date, type, assigned_user_id, is_responsible_on_shift, profiles:assigned_user_id(full_name)")
        .eq("is_draft", false)
        .not("assigned_user_id", "is", null)
        .gte("date", format(rangeStart, "yyyy-MM-dd"))
        .lte("date", format(rangeEnd, "yyyy-MM-dd"))
        .order("date")
        .order("start_time");
      if (error) throw error;
      return data;
    },
  });
}
