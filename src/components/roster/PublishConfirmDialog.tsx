import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ChevronDown, ChevronUp, Eye, ShieldAlert, Users, Clock, UserX, Moon } from "lucide-react";
import { format } from "date-fns";
import { getHeadcountTarget } from "./frictionValidation";
import { validateExclusions, validateRestPeriod } from "./frictionValidation";

interface StaffProfile {
  id: string;
  full_name: string;
  target_fte_percent: number;
  constraints?: any;
}

interface ShiftInfo {
  id: string;
  date: string;
  type: string;
  start_time: string;
  end_time: string;
  is_responsible_on_shift: boolean;
  is_draft: boolean;
  assigned_user_id: string | null;
  is_standby?: boolean;
  profiles?: any;
}

interface PreFlightWarning {
  category: "headcount" | "exclusion" | "fte" | "responsible" | "rest";
  severity: "amber" | "red";
  message: string;
}

interface PublishConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drafts: ShiftInfo[];
  allShifts: ShiftInfo[];
  onConfirm: () => void;
  isPending: boolean;
  staffProfiles: StaffProfile[];
  headcountLimits?: Record<string, number>;
}

function runPreFlightChecks(
  drafts: ShiftInfo[],
  allShifts: ShiftInfo[],
  staffProfiles: StaffProfile[],
  headcountLimits?: Record<string, number>,
): PreFlightWarning[] {
  const warnings: PreFlightWarning[] = [];
  const staffMap = new Map(staffProfiles.map((p) => [p.id, p]));

  // Simulate post-publish state
  const postPublish = allShifts.map((s) => (s.is_draft ? { ...s, is_draft: false } : s));
  const assigned = postPublish.filter((s) => s.assigned_user_id && !s.is_standby);

  // 1. Headcount gaps — group by date+type
  const dateTypes = new Map<string, ShiftInfo[]>();
  for (const s of assigned) {
    const key = `${s.date}|${s.type}`;
    if (!dateTypes.has(key)) dateTypes.set(key, []);
    dateTypes.get(key)!.push(s);
  }
  // Also check date+type combos that have a target but zero shifts
  const allDates = [...new Set(postPublish.map((s) => s.date))];
  const shiftTypes = ["morning", "evening", "night"];
  for (const date of allDates) {
    for (const type of shiftTypes) {
      const key = `${date}|${type}`;
      const count = dateTypes.get(key)?.length ?? 0;
      const target = getHeadcountTarget(type, date, headcountLimits);
      if (target > 0 && count < target) {
        warnings.push({
          category: "headcount",
          severity: "amber",
          message: `${format(new Date(date + "T00:00"), "EEE, MMM d")} ${type.charAt(0).toUpperCase() + type.slice(1)}: ${count}/${target} filled`,
        });
      }
    }
  }

  // 2. Exclusion violations (only for drafts being published)
  for (const s of drafts) {
    if (!s.assigned_user_id) continue;
    const profile = staffMap.get(s.assigned_user_id);
    if (!profile) continue;
    const excWarnings = validateExclusions(profile, s.type, s.date);
    for (const w of excWarnings) {
      warnings.push({
        category: "exclusion",
        severity: "red",
        message: w.message,
      });
    }
  }

  // 3. FTE overages — count shifts per user in post-publish week
  const userShiftCounts = new Map<string, number>();
  for (const s of assigned) {
    if (!s.assigned_user_id) continue;
    userShiftCounts.set(s.assigned_user_id, (userShiftCounts.get(s.assigned_user_id) ?? 0) + 1);
  }
  for (const [userId, count] of userShiftCounts) {
    const profile = staffMap.get(userId);
    if (!profile) continue;
    const fteLimit = Math.round((profile.target_fte_percent ?? 1) * 5);
    if (count > fteLimit) {
      warnings.push({
        category: "fte",
        severity: "red",
        message: `${profile.full_name}: ${count}/${fteLimit} shifts (${Math.round((profile.target_fte_percent ?? 1) * 100)}% FTE exceeded)`,
      });
    }
  }

  // 3b. Back-to-back rest violations across post-publish state.
  // Check each draft assignment against the user's other shifts within ±1 day.
  const byUser = new Map<string, ShiftInfo[]>();
  for (const s of assigned) {
    if (!s.assigned_user_id) continue;
    if (!byUser.has(s.assigned_user_id)) byUser.set(s.assigned_user_id, []);
    byUser.get(s.assigned_user_id)!.push(s);
  }
  const seenRestKeys = new Set<string>();
  for (const s of drafts) {
    if (!s.assigned_user_id || s.is_standby) continue;
    const profile = staffMap.get(s.assigned_user_id);
    if (!profile) continue;
    const userShifts = (byUser.get(s.assigned_user_id) ?? []).filter((o) => o.id !== s.id);
    const restWarnings = validateRestPeriod(
      {
        assignedUserId: s.assigned_user_id,
        date: s.date,
        start: s.start_time,
        end: s.end_time,
        isStandby: s.is_standby,
        excludeShiftId: s.id,
      },
      userShifts.map((o) => ({
        id: o.id,
        date: o.date,
        start_time: o.start_time,
        end_time: o.end_time,
        type: o.type,
        assigned_user_id: o.assigned_user_id,
        is_standby: o.is_standby,
      })),
      profile.full_name,
    );
    for (const w of restWarnings) {
      const key = `${s.assigned_user_id}|${s.date}|${s.type}`;
      if (seenRestKeys.has(key)) continue;
      seenRestKeys.add(key);
      warnings.push({
        category: "rest",
        severity: "red",
        message: `${format(new Date(s.date + "T00:00"), "EEE, MMM d")} ${s.type}: ${w.message}`,
      });
    }
  }

  // 4. Missing responsible nurse
  const grouped = new Map<string, ShiftInfo[]>();
  for (const s of assigned) {
    const key = `${s.date}|${s.type}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(s);
  }
  for (const [key, shifts] of grouped) {
    if (!shifts.some((s) => s.is_responsible_on_shift)) {
      const [date, type] = key.split("|");
      warnings.push({
        category: "responsible",
        severity: "amber",
        message: `${format(new Date(date + "T00:00"), "EEE, MMM d")} ${type.charAt(0).toUpperCase() + type.slice(1)}: No Responsible Nurse assigned`,
      });
    }
  }

  return warnings;
}

const categoryMeta: Record<string, { label: string; icon: React.ReactNode }> = {
  headcount: { label: "Headcount Gaps", icon: <Users className="h-4 w-4" /> },
  exclusion: { label: "Staffing Conflicts", icon: <ShieldAlert className="h-4 w-4" /> },
  fte: { label: "FTE Overages", icon: <Clock className="h-4 w-4" /> },
  responsible: { label: "Missing Responsible Nurse", icon: <UserX className="h-4 w-4" /> },
};

export function PublishConfirmDialog({
  open,
  onOpenChange,
  drafts,
  allShifts,
  onConfirm,
  isPending,
  staffProfiles,
  headcountLimits,
}: PublishConfirmDialogProps) {
  const [warningsExpanded, setWarningsExpanded] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const warnings = open ? runPreFlightChecks(drafts, allShifts, staffProfiles, headcountLimits) : [];

  const draftDates = drafts.map((d) => d.date).sort();
  const dateRange =
    draftDates.length > 0
      ? `${format(new Date(draftDates[0] + "T00:00"), "EEE, MMM d")} — ${format(new Date(draftDates[draftDates.length - 1] + "T00:00"), "EEE, MMM d, yyyy")}`
      : "";

  const grouped = new Map<string, PreFlightWarning[]>();
  for (const w of warnings) {
    if (!grouped.has(w.category)) grouped.set(w.category, []);
    grouped.get(w.category)!.push(w);
  }

  const redCount = warnings.filter((w) => w.severity === "red").length;
  const amberCount = warnings.filter((w) => w.severity === "amber").length;

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Publish {drafts.length} Draft{drafts.length > 1 ? "s" : ""}?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <div className="space-y-1">
                <p>
                  <span className="font-medium">{drafts.length}</span> draft shift{drafts.length > 1 ? "s" : ""} will be made visible to all staff.
                </p>
                {dateRange && (
                  <p className="text-xs text-muted-foreground">
                    Date range: {dateRange}
                  </p>
                )}
              </div>

              {warnings.length > 0 && (
                <div className="rounded-lg border border-amber-400/40 bg-amber-50/80 dark:bg-amber-950/20 p-3 space-y-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 w-full justify-between text-left hover:bg-transparent"
                    onClick={() => setWarningsExpanded(!warningsExpanded)}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <span>
                        Review {warnings.length} Warning{warnings.length > 1 ? "s" : ""}
                      </span>
                      {redCount > 0 && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                          {redCount} critical
                        </Badge>
                      )}
                      {amberCount > 0 && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-400/30">
                          {amberCount} minor
                        </Badge>
                      )}
                    </div>
                    {warningsExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>

                  {warningsExpanded && (
                    <div className="space-y-2 pt-1">
                      {Array.from(grouped.entries()).map(([category, catWarnings]) => {
                        const meta = categoryMeta[category] || { label: category, icon: null };
                        const isExpanded = expandedCategories.has(category);
                        const hasCritical = catWarnings.some((w) => w.severity === "red");

                        return (
                          <div
                            key={category}
                            className={`rounded border ${hasCritical ? "border-destructive/30 bg-destructive/5" : "border-amber-300/40 bg-background"}`}
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-full justify-between px-2.5 text-xs hover:bg-transparent"
                              onClick={() => toggleCategory(category)}
                            >
                              <div className="flex items-center gap-1.5">
                                {meta.icon}
                                <span className="font-medium">{meta.label}</span>
                                <Badge variant="outline" className="text-[10px] px-1 py-0">
                                  {catWarnings.length}
                                </Badge>
                              </div>
                              {isExpanded ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )}
                            </Button>
                            {isExpanded && (
                              <div className="px-2.5 pb-2 space-y-1">
                                {catWarnings.map((w, i) => (
                                  <div
                                    key={i}
                                    className={`text-xs px-2 py-1 rounded ${
                                      w.severity === "red"
                                        ? "text-destructive font-medium"
                                        : "text-amber-700 dark:text-amber-300"
                                    }`}
                                  >
                                    {w.message}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Keep Editing</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isPending}>
            {isPending ? "Publishing…" : "Confirm & Publish"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
