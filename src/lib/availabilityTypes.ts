// Shared mapping for availability request types.
// "leave" is the legacy generic value, kept only for displaying old data.

export type AvailabilityType =
  | "block"
  | "vacation"
  | "leave" // legacy, do not offer in new UI
  | "sick_leave"
  | "maternity_leave"
  | "yearly_leave"
  | "study";

export const LEAVE_TYPES = ["sick_leave", "maternity_leave", "yearly_leave", "study"] as const;

export const AVAIL_TYPE_LABEL_KEY: Record<string, string> = {
  block: "common.block",
  vacation: "common.vacation",
  leave: "common.leave",
  sick_leave: "common.sickLeave",
  maternity_leave: "common.maternityLeave",
  yearly_leave: "common.yearlyLeave",
  study: "common.study",
};

export const AVAIL_TYPE_FULL_KEY: Record<string, string> = {
  block: "avail.blockDates",
  vacation: "avail.vacationLabel",
  leave: "avail.leaveLabel",
  sick_leave: "avail.sickLeaveLabel",
  maternity_leave: "avail.maternityLeaveLabel",
  yearly_leave: "avail.yearlyLeaveLabel",
  study: "avail.studyLabel",
};

// Returns the matching emoji for select items / chips in legacy code paths.
export const AVAIL_TYPE_EMOJI: Record<string, string> = {
  block: "🚫",
  vacation: "🌴",
  leave: "✈️",
  sick_leave: "🩹",
  maternity_leave: "🍼",
  yearly_leave: "🌴",
  study: "📚",
};

export function isLeaveType(t: string | null | undefined): boolean {
  return (
    t === "leave" ||
    t === "sick_leave" ||
    t === "maternity_leave" ||
    t === "yearly_leave" ||
    t === "study"
  );
}

