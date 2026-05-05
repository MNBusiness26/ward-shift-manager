import { supabase } from "@/integrations/supabase/client";
import type { FrictionWarning } from "@/components/roster/FrictionDialog";

export interface LogContext {
  userId: string | null;
  createdBy: string;
  date: string;
  shiftType: string;
  shiftId?: string | null;
  wasShown: boolean;
  wasOverridden?: boolean;
}

/**
 * Insert friction warnings into friction_log for background tracking.
 * Failures are swallowed (logging must never block a save).
 */
export async function logFrictionWarnings(
  warnings: FrictionWarning[],
  ctx: LogContext,
): Promise<void> {
  if (!warnings.length) return;
  try {
    const rows = warnings.map((w) => ({
      shift_id: ctx.shiftId ?? null,
      user_id: ctx.userId,
      created_by: ctx.createdBy,
      date: ctx.date,
      shift_type: ctx.shiftType,
      warning_type: w.type,
      severity: w.severity === "red" ? "red" : "yellow",
      message: w.message,
      was_shown: ctx.wasShown,
      was_overridden: ctx.wasOverridden ?? false,
    }));
    await supabase.from("friction_log" as any).insert(rows as any);
  } catch {
    // silent
  }
}
