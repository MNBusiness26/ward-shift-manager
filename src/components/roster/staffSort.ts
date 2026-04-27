/**
 * Sorting hierarchy for staff within a shift / sidebar lists.
 *
 * Primary:   is_responsible (Staff Lead) first
 * Secondary: Role rank: manager > assistant_manager > nurse > assistant
 * Tertiary:  Alphabetical (Hebrew locale) by full_name
 */

export const ROLE_RANK: Record<string, number> = {
  manager: 0,
  assistant_manager: 1,
  nurse: 2,
  assistant: 3,
};

export interface SortableStaff {
  full_name: string;
  is_responsible?: boolean;
  is_responsible_on_shift?: boolean;
  role?: string | null;
  app_role?: string | null;
}

export function getRoleRank(role?: string | null): number {
  if (!role) return 99;
  return ROLE_RANK[role] ?? 99;
}

export function compareStaff(a: SortableStaff, b: SortableStaff): number {
  // Primary: responsible first (per-shift takes precedence over profile flag)
  const aResp = !!(a.is_responsible_on_shift ?? a.is_responsible);
  const bResp = !!(b.is_responsible_on_shift ?? b.is_responsible);
  if (aResp !== bResp) return aResp ? -1 : 1;

  // Secondary: role rank
  const aRank = getRoleRank(a.role ?? a.app_role);
  const bRank = getRoleRank(b.role ?? b.app_role);
  if (aRank !== bRank) return aRank - bRank;

  // Tertiary: alphabetical Hebrew
  return a.full_name.localeCompare(b.full_name, "he", { sensitivity: "base" });
}

/** Light grey background class for assistant role badges/cells. */
export const ASSISTANT_BG_CLASS = "bg-muted/60 text-muted-foreground border-muted-foreground/20";

export function isAssistant(role?: string | null): boolean {
  return role === "assistant";
}
