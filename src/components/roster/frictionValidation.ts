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
  minHours: number = MIN_REST_HOURS,
): FrictionWarning[] {
  if (candidate.isStandby) return [];
  const { start: candStart, end: candEnd } = shiftBounds(candidate.date, candidate.start, candidate.end);
  const dayMs = 24 * 60 * 60 * 1000;

  const neighbors = allShifts.filter((s) => {
    if (!s.assigned_user_id || s.assigned_user_id !== candidate.assignedUserId) return false;
    if (candidate.excludeShiftId && s.id === candidate.excludeShiftId) return false;
    if (s.is_standby) return false;
    const diff = Math.abs(new Date(s.date + "T00:00").getTime() - new Date(candidate.date + "T00:00").getTime());
    return diff <= dayMs * 2;
  });

  for (const n of neighbors) {
    const { start: nStart, end: nEnd } = shiftBounds(n.date, n.start_time, n.end_time);
    const [earlierEnd, laterStart] =
      nStart.getTime() < candStart.getTime() ? [nEnd, candStart] : [candEnd, nStart];
    const restMs = laterStart.getTime() - earlierEnd.getTime();
    if (restMs < 0) continue;
    const restHours = restMs / (60 * 60 * 1000);
    if (restHours < minHours) {
      return [
        {
          type: "rest",
          severity: "red",
          message: `${staffName} has insufficient rest between shifts (less than ${minHours} hours).`,
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
  config,
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
  config?: FrictionConfig;
}): FrictionWarning[] {
  if (!assignedUserId) return [];

  const cfg = config ?? DEFAULT_FRICTION_CONFIG;
  const warnings: FrictionWarning[] = [];
  const profile = staffProfiles.find((p) => p.id === assignedUserId);
  if (!profile) return [];

  // FTE check
  if (cfg.checks.fte_weekly.enabled) {
    const perWeek = cfg.fte_shifts_per_week ?? 5;
    const fteLimit = Math.round((profile.target_fte_percent ?? 1) * perWeek);
    const newTotal = weekShiftsForUser + 1;
    if (newTotal > fteLimit) {
      warnings.push({
        type: "fte",
        severity: cfg.checks.fte_weekly.severity,
        message: `${profile.full_name} has reached their FTE limit for this week (${weekShiftsForUser}/${fteLimit} shifts, ${Math.round((profile.target_fte_percent ?? 1) * 100)}% FTE).`,
      });
    }
  }

  // Exclusion checks (split into shift-type vs weekday)
  if (cfg.checks.excluded_shifts.enabled || cfg.checks.excluded_days.enabled) {
    const all = validateExclusions(profile, shiftType, shiftDate);
    for (const w of all) {
      // crude split: messages mention "shift excluded" vs day name
      const isDay = /Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Weekend/i.test(w.message);
      const allowed = isDay ? cfg.checks.excluded_days.enabled : cfg.checks.excluded_shifts.enabled;
      if (!allowed) continue;
      const sev = isDay ? cfg.checks.excluded_days.severity : cfg.checks.excluded_shifts.severity;
      warnings.push({ ...w, severity: sev });
    }
  }

  // Back-to-back rest check
  if (cfg.checks.rest_period.enabled && allShifts && shiftStartTime && shiftEndTime && !isStandby) {
    const minHours = cfg.checks.rest_period.min_hours ?? MIN_REST_HOURS;
    const restWarnings = validateRestPeriod(
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
      minHours,
    );
    for (const w of restWarnings) {
      warnings.push({ ...w, severity: cfg.checks.rest_period.severity });
    }
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

/**
 * Consecutive Weekend Block Restriction.
 * If the user already has an APPROVED block on Friday/Saturday in the same
 * Sun–Sat week as `targetDate` neighbours, returns a friction error when they
 * try to block the Friday/Saturday of an adjacent week.
 *
 * approvedRequests: rows from availability_requests for this user with
 * status='approved' and request_type !== 'preference'. Must include at least
 * `date` and optional `end_date`.
 */
export function validateConsecutiveWeekendBlock(
  targetDate: string,
  approvedRequests: Array<{ date: string; end_date?: string | null; request_type?: string | null; status?: string | null }>,
): { violates: boolean; message?: string } {
  const d = new Date(targetDate + "T00:00");
  const dow = d.getDay();
  if (dow !== 5 && dow !== 6) return { violates: false }; // only Fri/Sat
  const targetTime = d.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  for (const r of approvedRequests) {
    if (r.status && r.status !== "approved") continue;
    if (r.request_type === "preference") continue;
    const start = new Date(r.date + "T00:00").getTime();
    const end = new Date((r.end_date || r.date) + "T00:00").getTime();
    // Iterate days within the existing block
    for (let t = start; t <= end; t += dayMs) {
      const od = new Date(t);
      const odow = od.getDay();
      if (odow !== 5 && odow !== 6) continue;
      const diffDays = Math.round(Math.abs(targetTime - t) / dayMs);
      // Adjacent weekend = same weekday in the prior or next week
      if (diffDays === 7 || (diffDays >= 6 && diffDays <= 8 && odow !== dow)) {
        return {
          violates: true,
          message:
            "Cannot block this weekend day — you already have an approved weekend block in the adjacent week. Consecutive weekend blocks are restricted.",
        };
      }
    }
  }
  return { violates: false };
}

