/**
 * Centralized role labels.
 *
 * DB enum values (app_role): manager, assistant_manager, team_leader, nurse, assistant
 * Display names:
 *   manager           -> Ward Manager        / מנהלת מחלקה
 *   assistant_manager -> Assistant Manager   / סגנית מנהלת
 *   team_leader       -> Team Leader         / ראש צוות
 *   nurse             -> Nurse               / אחות
 *   assistant         -> Care Worker         / כוח עזר
 */

export type RoleKey =
  | "manager"
  | "assistant_manager"
  | "team_leader"
  | "nurse"
  | "assistant";

export const ROLE_OPTIONS: RoleKey[] = [
  "nurse",
  "assistant",
  "team_leader",
  "assistant_manager",
  "manager",
];

const LABELS: Record<string, { en: string; he: string }> = {
  manager: { en: "Ward Manager", he: "מנהלת מחלקה" },
  assistant_manager: { en: "Assistant Manager", he: "סגנית מנהלת" },
  team_leader: { en: "Team Leader", he: "ראש צוות" },
  nurse: { en: "Nurse", he: "אחות" },
  assistant: { en: "Care Worker", he: "כוח עזר" },
};

export function getRoleLabel(role: string | null | undefined, locale: string = "en"): string {
  if (!role) return "";
  const entry = LABELS[role];
  if (!entry) {
    // Fallback: prettify unknown role keys
    return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return locale === "he" ? entry.he : entry.en;
}
