import { getDay } from "date-fns";
import type { FrictionWarning } from "./FrictionDialog";
import { DEFAULT_FRICTION_CONFIG, type FrictionConfig } from "@/hooks/useFrictionConfig";

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
  const dayOfWeek = getDay(new Date(dateStr + "T00:00"));
  const isFriSat = dayOfWeek === 5 || dayOfWeek === 6;

  const defaults: Record<string, { monThu: number; friSat: number }> = {
    morning: { monThu: 6, friSat: 5 },
    evening: { monThu: 4, friSat: 4 },
    night: { monThu: 3, friSat: 3 },
  };

  // Support day-aware custom limits: { morning: { monThu: 6, friSat: 5 }, ... }
  if (customLimits && typeof customLimits[type] === "object") {
    const custom = customLimits[type] as { monThu: number; friSat: number };
    return isFriSat ? custom.friSat : custom.monThu;
  }

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

/** Minimum required rest hours between any two regular (non on-call) shifts. */
export const MIN_REST_HOURS = 8;

interface RestShift {
  id?: string;
  date: string;
  start_time: string;
  end_time: string;
  type?: string;
  assigned_user_id: string | null;
  is_standby?: boolean | null;
}

/** Build a Date from a yyyy-MM-dd date and HH:mm[:ss] time, treating end < start as next day. */
function shiftBounds(date: string, start: string, end: string): { start: Date; end: Date } {
  const startAt = new Date(`${date}T${start.length === 5 ? start + ":00" : start}`);
  let endAt = new Date(`${date}T${end.length === 5 ? end + ":00" : end}`);
  if (endAt.getTime() <= startAt.getTime()) {
    // overnight (e.g. night shift) — push end to next day
    endAt = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);
  }
  return { start: startAt, end: endAt };
}

/**
 * Check the back-to-back rest rule: at least MIN_REST_HOURS between the end of one
 * shift and the start of the next for the same user. On-call (is_standby) shifts
 * are exempt on either side. Handles night → next-day morning correctly.
 *
 * Returns a red-severity FrictionWarning when violated.
 */
export function validateRestPeriod(
  candidate: { assignedUserId: string; date: string; start: string; end: string; isStandby?: boolean; excludeShiftId?: string | null },
  allShifts: RestShift[],
  staffName: string,
): FrictionWarning[] {
  if (candidate.isStandby) return [];
  const { start: candStart, end: candEnd } = shiftBounds(candidate.date, candidate.start, candidate.end);
  const dayMs = 24 * 60 * 60 * 1000;

  // Look at any shift for this user within +/- 24h of the candidate window
  const neighbors = allShifts.filter((s) => {
    if (!s.assigned_user_id || s.assigned_user_id !== candidate.assignedUserId) return false;
    if (candidate.excludeShiftId && s.id === candidate.excludeShiftId) return false;
    if (s.is_standby) return false; // on-call exempt
    const diff = Math.abs(new Date(s.date + "T00:00").getTime() - new Date(candidate.date + "T00:00").getTime());
    return diff <= dayMs * 2;
  });

  for (const n of neighbors) {
    const { start: nStart, end: nEnd } = shiftBounds(n.date, n.start_time, n.end_time);
    // earlier vs later
    const [earlierEnd, laterStart] =
      nStart.getTime() < candStart.getTime() ? [nEnd, candStart] : [candEnd, nStart];
    const restMs = laterStart.getTime() - earlierEnd.getTime();
    if (restMs < 0) continue; // overlap is a different concern; skip here
    const restHours = restMs / (60 * 60 * 1000);
    if (restHours < MIN_REST_HOURS) {
      return [
        {
          type: "rest",
          severity: "red",
          message: `${staffName} has insufficient rest between shifts (less than ${MIN_REST_HOURS} hours).`,
        },
      ];
    }
  }
  return [];
}

/**
 * Check FTE and role-rule constraints before saving a shift.
 * Returns an array of warnings that require override confirmation.
 */
export function validateShiftFriction({
  assignedUserId,
  shiftType,
  shiftDate,
  shiftStartTime,
  shiftEndTime,
  isStandby,
  editingShiftId,
  weekShiftsForUser,
  staffProfiles,
  allShifts,
}: {
  assignedUserId: string | null;
  shiftType: string;
  shiftDate: string;
  shiftStartTime?: string;
  shiftEndTime?: string;
  isStandby?: boolean;
  editingShiftId?: string | null;
  weekShiftsForUser: number;
  staffProfiles: StaffProfile[];
  allShifts?: RestShift[];
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

  // Back-to-back rest check (skip if on-call)
  if (allShifts && shiftStartTime && shiftEndTime && !isStandby) {
    warnings.push(
      ...validateRestPeriod(
        {
          assignedUserId,
          date: shiftDate,
          start: shiftStartTime,
          end: shiftEndTime,
          isStandby,
          excludeShiftId: editingShiftId ?? null,
        },
        allShifts,
        profile.full_name,
      ),
    );
  }

  return warnings;
}

/** Roles that count toward shift headcount capacity (assistants are excluded). */
export const HEADCOUNT_ROLES = new Set(["nurse", "manager", "assistant_manager", "team_leader"]);

/** Returns true if a staff role counts toward headcount capacity. */
export function countsTowardHeadcount(role?: string | null): boolean {
  if (!role) return true; // unknown roles default to counted (safe)
  return HEADCOUNT_ROLES.has(role);
}

/**
 * Check headcount for a given date/type.
 * Returns true if headcount exceeds the day-aware target.
 * On Call shifts do NOT count.
 * External (Not at Ward) shifts do NOT count toward headcount.
 * Assistants do NOT count toward headcount capacity.
 */
export function isOverHeadcount(
  shifts: Array<{ date: string; type: string; assigned_user_id: string | null; is_standby?: boolean; is_external?: boolean }>,
  date: string,
  type: string,
  customLimits?: Record<string, number>,
  staffRoles?: Map<string, string>,
): boolean {
  const limit = getHeadcountTarget(type, date, customLimits);
  if (!limit) return false;
  const count = shifts.filter((s) => {
    if (s.date !== date || s.type !== type || !s.assigned_user_id) return false;
    if ((s as any).is_standby) return false;
    if ((s as any).is_external) return false;
    if (staffRoles) {
      const role = staffRoles.get(s.assigned_user_id);
      if (!countsTowardHeadcount(role)) return false;
    }
    return true;
  }).length;
  return count > limit;
}
