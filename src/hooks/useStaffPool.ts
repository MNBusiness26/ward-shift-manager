import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StaffPoolMember = {
  id: string;
  full_name: string;
  is_active: boolean;
  is_responsible: boolean;
  target_fte_percent: number;
  constraints: Record<string, unknown>;
  email: string | null;
  role: string;
  /** 'profile' = real signed-up user; 'pending' = unclaimed staff_directory entry. */
  kind: "profile" | "pending";
  /** App role (only useful for pending entries; profiles use user_roles). */
  app_role?: string;
  created_at?: string;
};

/**
 * Returns a unified list of schedulable staff:
 * - All rows from `profiles`
 * - Plus all unclaimed rows from `staff_directory` (shadow profiles)
 *
 * Shadow profiles use the directory row id as their stable id, which is what
 * gets written into `shifts.assigned_user_id` when assigned.
 */
export function useStaffPool() {
  return useQuery({
    queryKey: ["staff-pool"],
    queryFn: async (): Promise<StaffPoolMember[]> => {
      const [profilesRes, directoryRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase
          .from("staff_directory")
          .select("*")
          .eq("is_claimed", false)
          .order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (directoryRes.error) throw directoryRes.error;

      const roleMap = new Map<string, string[]>();
      for (const r of rolesRes.data ?? []) {
        const list = roleMap.get(r.user_id) ?? [];
        list.push(r.role);
        roleMap.set(r.user_id, list);
      }

      const profiles: StaffPoolMember[] = (profilesRes.data ?? []).map((p: any) => ({
        id: p.id,
        full_name: p.full_name || "Unnamed",
        is_active: !!p.is_active,
        is_responsible: !!p.is_responsible,
        target_fte_percent: Number(p.target_fte_percent ?? 1),
        constraints: typeof p.constraints === "object" && p.constraints ? p.constraints : {},
        email: p.email ?? null,
        role: p.role || "nurse",
        kind: "profile",
        app_role: roleMap.get(p.id)?.[0] || p.role || "nurse",
        created_at: p.created_at,
      }));

      const pending: StaffPoolMember[] = (directoryRes.data ?? []).map((d: any) => ({
        id: d.id,
        full_name: d.full_name,
        is_active: true, // schedulable from the manager's POV
        is_responsible: false,
        target_fte_percent: Number(d.target_fte_percent ?? 1),
        constraints: {},
        email: d.email,
        role: d.app_role,
        kind: "pending",
        app_role: d.app_role,
        created_at: d.created_at,
      }));

      // De-dup by id. When a placeholder profile (inactive) and a pending
      // directory entry share the same id, prefer the pending entry so the
      // staff member remains schedulable in the manager UI.
      const byId = new Map<string, StaffPoolMember>();
      for (const m of [...profiles, ...pending]) {
        const existing = byId.get(m.id);
        if (!existing) {
          byId.set(m.id, m);
          continue;
        }
        // Prefer pending over an inactive placeholder profile
        if (existing.kind === "profile" && !existing.is_active && m.kind === "pending") {
          byId.set(m.id, m);
        }
      }
      return Array.from(byId.values()).sort((a, b) =>
        a.full_name.localeCompare(b.full_name, "he", { sensitivity: "base" })
      );
    },
  });
}
