import { getDay } from "date-fns";
import type { FrictionWarning } from "./FrictionDialog";

interface StaffProfile {
  id: string;
  full_name: string;
  target_fte_percent: number;
  constraints?: any;
}

/**
 * Day-of-week aware headcount targets.
 * Monday–Thursday: Morning 6, Evening 4, Night 3
 * Friday–Saturday: Morning 5, Evening 4, Night 3
 * Sunday uses Mon–Thu defaults.
 */
export function getHeadcountTarget(
  type: string,
  dateStr: string,
  customLimits?: Record<string, number | Record<string, number>>,
): number {
  // If custom limits are a flat object (legacy admin settings), use them directly
  if (customLimits && typeof customLimits[type] === "number") {
    return customLimits[type] as number;
  }

  const dayOfWeek = getDay(new Date(dateStr + "T00:00"));
  const isFriSat = dayOfWeek === 5 || dayOfWeek === 6;

  const defaults: Record<string, { monThu: number; friSat: number }> = {
    morning: { monThu: 6, friSat: 5 },
    evening: { monThu: 4, friSat: 4 },
    night: { monThu: 3, friSat: 3 },
  };

  const target = defaults[type];
  if (!target) return 0;
  return isFriSat ? target.friSat : target.monThu;
}

/** Default shift start/end times */
export const DEFAULT_SHIFT_TIMES: Record<string, { start: string; end: string }> = {
  morning: { start: "07:00", end: "15:00" },
  evening: { start: "14:30", end: "23:00" },
  night: { start: "22:30", end: "07:00" },
};

/**
 * Validate staff exclusion constraints (shift types and weekdays).
 * constraints.excluded_shifts: string[] e.g. ["morning", "night"]
 * constraints.excluded_days: number[] e.g. [0, 6] (Sunday, Saturday)
 * Legacy: constraints.no_nights, constraints.no_weekends still supported.
 */
export function validateExclusions(
  profile: StaffProfile,
  shiftType: string,
  shiftDate: string,
): FrictionWarning[] {
  const warnings: FrictionWarning[] = [];
  const c = typeof profile.constraints === "object" && profile.constraints !== null ? profile.constraints : {};

  // New exclusion model
  const excludedShifts: string[] = (c as any).excluded_shifts || [];
  const excludedDays: number[] = (c as any).excluded_days || [];

  if (excludedShifts.includes(shiftType)) {
    const label = shiftType.charAt(0).toUpperCase() + shiftType.slice(1);
    warnings.push({
      type: "role_rule",
      message: `This assignment is excluded by ${profile.full_name}'s policy (${label} shift excluded).`,
    });
  }

  if (shiftDate) {
    try {
      const dayOfWeek = getDay(new Date(shiftDate + "T00:00"));
      if (excludedDays.includes(dayOfWeek)) {
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        warnings.push({
          type: "role_rule",
          message: `This assignment is excluded by ${profile.full_name}'s policy (${dayNames[dayOfWeek]} excluded).`,
        });
      }
    } catch {}
  }

  // Legacy support
  if (shiftType === "night" && (c as any).no_nights && !excludedShifts.includes("night")) {
    warnings.push({
      type: "role_rule",
      message: `This shift violates ${profile.full_name}'s "No Night Shifts" policy.`,
    });
  }

  if (shiftDate) {
    try {
      const dayOfWeek = getDay(new Date(shiftDate + "T00:00"));
      if (dayOfWeek === 6 && (c as any).no_weekends && !excludedDays.includes(6)) {
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

  // Exclusion checks (new model + legacy)
  warnings.push(...validateExclusions(profile, shiftType, shiftDate));

  return warnings;
}

/**
 * Check headcount for a given date/type.
 * Returns true if headcount exceeds the day-aware target.
 * On Call shifts do NOT count.
 */
export function isOverHeadcount(
  shifts: Array<{ date: string; type: string; assigned_user_id: string | null; is_standby?: boolean }>,
  date: string,
  type: string,
  customLimits?: Record<string, number>,
): boolean {
  const limit = getHeadcountTarget(type, date, customLimits);
  if (!limit) return false;
  const count = shifts.filter(
    (s) => s.date === date && s.type === type && s.assigned_user_id && !(s as any).is_standby
  ).length;
  return count > limit;
}
