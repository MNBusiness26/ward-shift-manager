import { getDay } from "date-fns";
import type { FrictionWarning } from "./FrictionDialog";

interface StaffProfile {
  id: string;
  full_name: string;
  target_fte_percent: number;
  constraints?: any;
}

/** 
 * Headcount limits per shift type (excluding standby). 
 * Exceeding triggers a yellow warning indicator.
 */
export const HEADCOUNT_LIMITS: Record<string, number> = {
  morning: 4,
  evening: 3,
  night: 2,
};

/**
 * Check FTE and role-rule constraints before saving a shift.
 * Returns an array of warnings that require override confirmation.
 */
export function validateShiftFriction({
  assignedUserId,
  shiftType,
  shiftDate,
  weekShiftsForUser,
  staffProfiles,
}: {
  assignedUserId: string | null;
  shiftType: string;
  shiftDate: string;
  /** Count of existing shifts for this user in the same week (excluding the shift being edited) */
  weekShiftsForUser: number;
  staffProfiles: StaffProfile[];
}): FrictionWarning[] {
  if (!assignedUserId) return [];

  const warnings: FrictionWarning[] = [];
  const profile = staffProfiles.find((p) => p.id === assignedUserId);
  if (!profile) return [];

  // FTE check: 1.0 FTE = 5 shifts/week
  const fteLimit = Math.round((profile.target_fte_percent ?? 1) * 5);
  const newTotal = weekShiftsForUser + 1;
  if (newTotal > fteLimit) {
    warnings.push({
      type: "fte",
      message: `${profile.full_name} has reached their FTE limit for this week (${weekShiftsForUser}/${fteLimit} shifts, ${Math.round((profile.target_fte_percent ?? 1) * 100)}% FTE).`,
    });
  }

  // Role rule checks
  const c = typeof profile.constraints === "object" && profile.constraints !== null ? profile.constraints : {};

  if (shiftType === "night" && (c as any).no_nights) {
    warnings.push({
      type: "role_rule",
      message: `This shift violates ${profile.full_name}'s "No Night Shifts" policy.`,
    });
  }

  if (shiftDate) {
    try {
      const dayOfWeek = getDay(new Date(shiftDate + "T00:00"));
      // Saturday (6) is considered weekend
      if (dayOfWeek === 6 && (c as any).no_weekends) {
        warnings.push({
          type: "role_rule",
          message: `This shift violates ${profile.full_name}'s "No Weekend Shifts" policy.`,
        });
      }
    } catch {}
  }

  return warnings;
}

/**
 * Check headcount for a given date/type.
 * Returns true if headcount exceeds limits.
 * Standby shifts do NOT count.
 */
export function isOverHeadcount(
  shifts: Array<{ date: string; type: string; assigned_user_id: string | null; is_standby?: boolean }>,
  date: string,
  type: string,
): boolean {
  const limit = HEADCOUNT_LIMITS[type];
  if (!limit) return false;
  const count = shifts.filter(
    (s) => s.date === date && s.type === type && s.assigned_user_id && !(s as any).is_standby
  ).length;
  return count > limit;
}
