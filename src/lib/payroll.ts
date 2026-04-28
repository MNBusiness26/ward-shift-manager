// Payroll calculation helpers — reuses shifts.actual_start_time / actual_end_time / is_verified.
// Hours fall back to scheduled times when actual values are missing.

export interface PayrollShift {
  id: string;
  date: string;
  type: string;
  start_time: string;
  end_time: string;
  actual_start_time?: string | null;
  actual_end_time?: string | null;
  is_verified?: boolean;
  is_standby?: boolean;
  is_responsible_on_shift?: boolean;
  comments?: string | null;
}

// Convert HH:MM (or HH:MM:SS) → minutes
function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

// Returns hours (decimal). Handles overnight (end < start).
export function shiftDurationHours(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 0;
  const s = toMin(startTime);
  let e = toMin(endTime);
  if (e <= s) e += 24 * 60; // overnight
  return Math.max(0, (e - s) / 60);
}

export function shiftPaidHours(s: PayrollShift): number {
  // On-call always pays full scheduled duration
  if (s.is_standby) return shiftDurationHours(s.start_time, s.end_time);
  // Verified with actuals → use actuals, else fall back to scheduled
  if (s.is_verified && s.actual_start_time && s.actual_end_time) {
    return shiftDurationHours(s.actual_start_time, s.actual_end_time);
  }
  return shiftDurationHours(s.start_time, s.end_time);
}

export interface StaffPayrollTotals {
  user_id: string;
  full_name: string;
  regularHours: number;
  onCallHours: number;
  responsibleShifts: number;
  shifts: PayrollShift[];
  // Approved leave/vacation/block ranges that overlap month
  leave: Array<{ type: string; date: string; end_date: string | null; reason: string | null }>;
}

export function aggregateStaffTotals(shifts: PayrollShift[]): { regularHours: number; onCallHours: number; responsibleShifts: number } {
  let regularHours = 0;
  let onCallHours = 0;
  let responsibleShifts = 0;
  for (const s of shifts) {
    const h = shiftPaidHours(s);
    if (s.is_standby) onCallHours += h;
    else regularHours += h;
    if (s.is_responsible_on_shift) responsibleShifts += 1;
  }
  return {
    regularHours: Math.round(regularHours * 100) / 100,
    onCallHours: Math.round(onCallHours * 100) / 100,
    responsibleShifts,
  };
}
