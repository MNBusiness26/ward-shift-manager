import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { format, startOfWeek, addWeeks, subWeeks, addDays, subDays, eachDayOfInterval, getDay } from "date-fns";
import { formatLocale } from "@/i18n/dateLocale";
import { useTranslation } from "@/i18n/useTranslation";
import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Eye, EyeOff, AlertTriangle, Plus, Trash2, Copy, ClipboardPaste, Users, Star, Save, FolderOpen, Lock, Settings, X, Phone, ArrowLeftRight } from "lucide-react";
import { compareStaff, isAssistant, ASSISTANT_BG_CLASS } from "@/components/roster/staffSort";
import { BulkAssignDialog } from "@/components/roster/BulkAssignDialog";
import { PublishConfirmDialog } from "@/components/roster/PublishConfirmDialog";
import { FrictionDialog, type FrictionWarning } from "@/components/roster/FrictionDialog";
import { VersionCompareDialog, type VersionDiff } from "@/components/roster/VersionCompareDialog";
import { validateShiftFriction, isOverHeadcount, getHeadcountTarget } from "@/components/roster/frictionValidation";
import { useAppSettings } from "@/hooks/useAppSettings";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useStaffPool } from "@/hooks/useStaffPool";
import type { Database } from "@/integrations/supabase/types";

type ShiftType = Database["public"]["Enums"]["shift_type"];

const shiftBgDraft: Record<string, string> = {
  morning: "bg-shift-morning/10 border-shift-morning/25 text-shift-morning border-dashed",
  evening: "bg-shift-evening/10 border-shift-evening/25 text-shift-evening border-dashed",
  night: "bg-shift-night/10 border-shift-night/25 text-shift-night border-dashed",
};

const shiftBgPublished: Record<string, string> = {
  morning: "bg-shift-morning/30 border-shift-morning/60 text-shift-morning",
  evening: "bg-shift-evening/30 border-shift-evening/60 text-shift-evening",
  night: "bg-shift-night/30 border-shift-night/60 text-shift-night",
};

const shiftTimes: Record<ShiftType, { start: string; end: string }> = {
  morning: { start: "07:00", end: "15:00" },
  evening: { start: "14:30", end: "23:00" },
  night: { start: "22:30", end: "07:00" },
};

const warningStorageKey = "roster-dismissed-warnings";

interface ShiftFormData {
  date: string;
  type: ShiftType;
  start_time: string;
  end_time: string;
  assigned_user_id: string;
  is_responsible_on_shift: boolean;
  manager_on_duty_id: string;
  comments: string;
  is_draft: boolean;
  is_standby: boolean;
  is_external: boolean;
}

const defaultForm = (date?: string): ShiftFormData => ({
  date: date || format(new Date(), "yyyy-MM-dd"),
  type: "morning",
  start_time: "07:00",
  end_time: "15:00",
  assigned_user_id: "",
  is_responsible_on_shift: false,
  manager_on_duty_id: "",
  comments: "",
  is_draft: true,
  is_standby: false,
  is_external: false,
});

interface CopiedWeek {
  shifts: Array<{
    dayIndex: number;
    type: ShiftType;
    start_time: string;
    end_time: string;
    assigned_user_id: string | null;
    is_responsible_on_shift: boolean;
    manager_on_duty_id: string | null;
    comments: string | null;
  }>;
}

export default function Roster() {
  const { t, locale } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [viewStart, setViewStart] = useState(startOfWeek(new Date(), { weekStartsOn: 0 }));
  const viewEnd = addDays(viewStart, 6);
  const days = eachDayOfInterval({ start: viewStart, end: viewEnd });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<string | null>(null);
  const [form, setForm] = useState<ShiftFormData>(defaultForm());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [frictionWarnings, setFrictionWarnings] = useState<FrictionWarning[]>([]);
  const [frictionOpen, setFrictionOpen] = useState(false);

  // Copy/Paste state
  const [copiedWeek, setCopiedWeek] = useState<CopiedWeek | null>(null);

  // Save As dialog
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");

  // Load version dialog
  const [loadOpen, setLoadOpen] = useState(false);

  // Version comparison
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareVersion, setCompareVersion] = useState<any>(null);
  const [compareDiffs, setCompareDiffs] = useState<VersionDiff[]>([]);

  // Track current version for "Save" (overwrite)
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);
  const [currentVersionName, setCurrentVersionName] = useState<string | null>(null);

  // Full-week enforcement from admin settings
  const { enforceFullWeek, headcountLimits } = useAppSettings();
  const isFullWeek = getDay(viewStart) === 0; // Sunday start
  const [clearWeekConfirmOpen, setClearWeekConfirmOpen] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [dismissedWarningKeys, setDismissedWarningKeys] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = window.sessionStorage.getItem(warningStorageKey);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  // Info popup state (for copy/paste/clear confirmations)
  const [infoPopup, setInfoPopup] = useState<{ title: string; message: string } | null>(null);

  const { data: shifts = [] } = useQuery({
    queryKey: ["roster-shifts", format(viewStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*, profiles:assigned_user_id(full_name)")
        .gte("date", format(viewStart, "yyyy-MM-dd"))
        .lte("date", format(viewEnd, "yyyy-MM-dd"))
        .order("date")
        .order("start_time");
      if (error) throw error;
      return data;
    },
  });

  // Unified pool: active profiles + unclaimed staff_directory ("pending") entries.
  const { data: staffPool = [] } = useStaffPool();
  const staff = staffPool
    .filter((s) => s.is_active || s.kind === "pending")
    .slice()
    .sort(compareStaff);

  const { data: managers = [] } = useQuery({
    queryKey: ["all-managers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "manager");
      if (error) throw error;
      return data?.map((r) => r.user_id) ?? [];
    },
  });

  const { data: blockedDates = [] } = useQuery({
    queryKey: ["approved-blocks", format(viewStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_requests")
        .select("user_id, date, end_date, request_type")
        .eq("status", "approved")
        .lte("date", format(viewEnd, "yyyy-MM-dd"))
        .or(`end_date.gte.${format(viewStart, "yyyy-MM-dd")},end_date.is.null`);
      if (error) throw error;
      return data;
    },
  });

  // Hard-locked dates
  const { data: hardBlockedDates = [] } = useQuery({
    queryKey: ["blocked-dates", format(viewStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blocked_dates")
        .select("date")
        .gte("date", format(viewStart, "yyyy-MM-dd"))
        .lte("date", format(viewEnd, "yyyy-MM-dd"));
      if (error) throw error;
      return data?.map((d) => d.date) ?? [];
    },
  });

  // All user roles for standby filtering
  const { data: allUserRoles = [] } = useQuery({
    queryKey: ["all-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data;
    },
  });

  // Saved versions for Load dialog
  const { data: savedVersions = [], refetch: refetchVersions } = useQuery({
    queryKey: ["roster-versions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roster_versions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: loadOpen,
  });

  const saveShift = useMutation({
    mutationFn: async () => {
      const payload = {
        date: form.date,
        type: form.type,
        start_time: form.start_time,
        end_time: form.end_time,
        assigned_user_id: form.assigned_user_id || null,
        is_responsible_on_shift: form.is_responsible_on_shift,
        manager_on_duty_id: form.manager_on_duty_id || null,
        comments: form.comments || null,
        is_draft: form.is_draft,
        is_standby: form.is_standby,
        is_external: form.is_external,
      };
      if (editingShift) {
        const { error } = await supabase.from("shifts").update(payload).eq("id", editingShift);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("shifts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster-shifts"] });
      setDialogOpen(false);
      setEditingShift(null);
      setSaveError(null);
      toast.success(editingShift ? "Shift updated" : "Shift created");
    },
    onError: (e: any) => { setSaveError(e.message); toast.error(e.message); },
  });

  const deleteShift = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shifts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster-shifts"] });
      toast.success("Shift deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const publishDrafts = useMutation({
    mutationFn: async () => {
      const drafts = shifts.filter((s) => s.is_draft);
      const draftIds = drafts.map((s) => s.id);
      if (draftIds.length === 0) return [];
      const { error } = await supabase.from("shifts").update({ is_draft: false }).in("id", draftIds);
      if (error) throw error;
      // Return affected staff names
      const affectedUserIds = [...new Set(drafts.map((s) => s.assigned_user_id).filter(Boolean))];
      return affectedUserIds.map((uid) => staff.find((s) => s.id === uid)?.full_name || "Unknown");
    },
    onSuccess: (staffNames) => {
      queryClient.invalidateQueries({ queryKey: ["roster-shifts"] });
      if (staffNames && staffNames.length > 0) {
        toast.success(`Schedule published! Notified: ${staffNames.join(", ")}`);
      } else {
        toast.success("Schedule published!");
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const clearWeek = useMutation({
    mutationFn: async () => {
      const draftShifts = shifts.filter((s) => s.is_draft);
      const publishedShifts = shifts.filter((s) => !s.is_draft);
      if (draftShifts.length === 0) {
        // Nothing to clear — all published
        return { hadPublished: publishedShifts.length > 0, deletedCount: 0 };
      }
      const draftIds = draftShifts.map((s) => s.id);
      const { error } = await supabase
        .from("shifts")
        .delete()
        .in("id", draftIds);
      if (error) throw error;
      return { hadPublished: publishedShifts.length > 0, deletedCount: draftShifts.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["roster-shifts"] });
      setClearWeekConfirmOpen(false);
      if (result?.deletedCount === 0) {
        setInfoPopup({ title: "Clear Week", message: "No draft shifts to remove. Published shifts remain for safety." });
      } else if (result?.hadPublished) {
        setInfoPopup({ title: "Clear Week", message: "Only draft shifts were removed. Published shifts remain for safety." });
      } else {
        setInfoPopup({ title: "Clear Week", message: "All draft shifts cleared." });
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Copy current week to clipboard
  const handleCopyWeek = () => {
    if (shifts.length === 0) {
      toast.error("No shifts to copy");
      return;
    }
    const copied: CopiedWeek = {
      shifts: shifts.map((s) => {
        const dayIndex = days.findIndex((d) => format(d, "yyyy-MM-dd") === s.date);
        return {
          dayIndex,
          type: s.type,
          start_time: s.start_time,
          end_time: s.end_time,
          assigned_user_id: s.assigned_user_id,
          is_responsible_on_shift: s.is_responsible_on_shift,
          manager_on_duty_id: s.manager_on_duty_id,
          comments: s.comments,
        };
      }),
    };
    setCopiedWeek(copied);
    setInfoPopup({ title: "Week Copied", message: "Week copied to clipboard. Navigate to target week and paste." });
  };

  // Paste copied week
  const pasteWeek = useMutation({
    mutationFn: async () => {
      if (!copiedWeek) return;
      const inserts = copiedWeek.shifts
        .filter((s) => s.dayIndex >= 0 && s.dayIndex <= 6)
        .map((s) => ({
          date: format(days[s.dayIndex], "yyyy-MM-dd"),
          type: s.type,
          start_time: s.start_time,
          end_time: s.end_time,
          assigned_user_id: s.assigned_user_id,
          is_responsible_on_shift: s.is_responsible_on_shift,
          manager_on_duty_id: s.manager_on_duty_id,
          comments: s.comments,
          is_draft: true,
        }));
      if (inserts.length === 0) return;
      const { error } = await supabase.from("shifts").insert(inserts);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster-shifts"] });
      setCopiedWeek(null);
      setInfoPopup({ title: "Week Pasted", message: "Week successfully pasted as drafts." });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Save (overwrite current version, or create first version)
  const handleSave = async () => {
    const weekStr = format(viewStart, "yyyy-MM-dd");
    const shiftsData = shifts.map((s) => ({
      date: s.date, type: s.type, start_time: s.start_time, end_time: s.end_time,
      assigned_user_id: s.assigned_user_id, is_responsible_on_shift: s.is_responsible_on_shift,
      manager_on_duty_id: s.manager_on_duty_id, comments: s.comments, is_draft: s.is_draft,
    }));

    if (currentVersionId) {
      // Overwrite existing version
      const { error } = await supabase.from("roster_versions")
        .update({ shifts_data: shiftsData })
        .eq("id", currentVersionId);
      if (error) { toast.error(error.message); return; }
      toast.success(`Saved "${currentVersionName}"`);
    } else {
      // Create first version for this week
      const { data: existing } = await supabase
        .from("roster_versions").select("version_name")
        .eq("week_start_date", weekStr).order("created_at", { ascending: false }).limit(1);
      let versionNum = 1;
      if (existing && existing.length > 0) {
        const match = existing[0].version_name.match(/_v(\d+)$/);
        if (match) versionNum = parseInt(match[1]) + 1;
      }
      const versionName = `draft_${weekStr}_v${versionNum}`;
      const { data, error } = await supabase.from("roster_versions").insert({
        version_name: versionName, week_start_date: weekStr,
        shifts_data: shiftsData, created_by: user?.id || "",
      }).select("id").single();
      if (error) { toast.error(error.message); return; }
      setCurrentVersionId(data.id);
      setCurrentVersionName(versionName);
      toast.success(`Saved as ${versionName}`);
    }
  };

  // Save As — auto-suggest name
  const handleOpenSaveAs = () => {
    const weekStr = format(viewStart, "yyyy-MM-dd");
    // Auto-generate suggested name
    (async () => {
      const { data: existing } = await supabase
        .from("roster_versions").select("version_name")
        .eq("week_start_date", weekStr).order("created_at", { ascending: false }).limit(1);
      let versionNum = 1;
      if (existing && existing.length > 0) {
        const match = existing[0].version_name.match(/_v(\d+)$/);
        if (match) versionNum = parseInt(match[1]) + 1;
      }
      setSaveAsName(`draft_${weekStr}_v${versionNum}`);
      setSaveAsOpen(true);
    })();
  };

  // Save As
  const handleSaveAs = async () => {
    const weekStr = format(viewStart, "yyyy-MM-dd");
    const name = saveAsName.trim() || `draft_${weekStr}_custom`;
    const shiftsData = shifts.map((s) => ({
      date: s.date, type: s.type, start_time: s.start_time, end_time: s.end_time,
      assigned_user_id: s.assigned_user_id, is_responsible_on_shift: s.is_responsible_on_shift,
      manager_on_duty_id: s.manager_on_duty_id, comments: s.comments, is_draft: s.is_draft,
    }));

    const { data, error } = await supabase.from("roster_versions").insert({
      version_name: name, week_start_date: weekStr,
      shifts_data: shiftsData, created_by: user?.id || "",
    }).select("id").single();
    if (error) { toast.error(error.message); return; }
    setCurrentVersionId(data.id);
    setCurrentVersionName(name);
    toast.success(`Saved as "${name}"`);
    setSaveAsOpen(false);
    setSaveAsName("");
  };

  // Compute diffs between current shifts and a saved version
  const computeVersionDiffs = (version: any): VersionDiff[] => {
    const savedShifts = version.shifts_data as any[];
    const diffs: VersionDiff[] = [];
    const staffMap = new Map(staff.map((s) => [s.id, s.full_name]));

    // Current shifts keyed by date+type+user
    const currentKeys = new Set(
      shifts.map((s) => `${s.date}|${s.type}|${s.assigned_user_id}`)
    );
    const savedKeys = new Set(
      savedShifts.map((s: any) => `${s.date}|${s.type}|${s.assigned_user_id}`)
    );

    // Added in saved version (not in current)
    for (const s of savedShifts) {
      const key = `${s.date}|${s.type}|${s.assigned_user_id}`;
      if (!currentKeys.has(key)) {
        const name = staffMap.get(s.assigned_user_id) || "Unassigned";
        // Check if same date+type exists with different user (changed)
        const currentSameSlot = shifts.find(
          (c) => c.date === s.date && c.type === s.type && c.assigned_user_id !== s.assigned_user_id
        );
        if (currentSameSlot) {
          const oldName = staffMap.get(currentSameSlot.assigned_user_id || "") || "Unassigned";
          diffs.push({
            staffName: name,
            type: "changed",
            detail: `${s.date} ${s.type}: ${oldName} → ${name}`,
          });
        } else {
          diffs.push({
            staffName: name,
            type: "added",
            detail: `${s.date} ${s.type}`,
          });
        }
      }
    }

    // Removed (in current but not in saved)
    for (const s of shifts) {
      const key = `${s.date}|${s.type}|${s.assigned_user_id}`;
      if (!savedKeys.has(key)) {
        const alreadyCovered = diffs.some(
          (d) => d.detail.includes(s.date) && d.detail.includes(s.type) && d.type === "changed"
        );
        if (!alreadyCovered) {
          const name = staffMap.get(s.assigned_user_id || "") || "Unassigned";
          diffs.push({
            staffName: name,
            type: "removed",
            detail: `${s.date} ${s.type}`,
          });
        }
      }
    }

    return diffs;
  };

  const handleLoadVersionClick = (version: any) => {
    const diffs = computeVersionDiffs(version);
    setCompareVersion(version);
    setCompareDiffs(diffs);
    setCompareOpen(true);
  };

  // Load a saved version (after comparison confirmation)
  const loadVersion = useMutation({
    mutationFn: async (version: any) => {
      const weekStr = version.week_start_date;
      const weekStartDate = new Date(weekStr + "T00:00:00");
      const weekEndDate = addDays(weekStartDate, 6);

      // Delete existing shifts for that week
      const { error: delError } = await supabase
        .from("shifts")
        .delete()
        .gte("date", weekStr)
        .lte("date", format(weekEndDate, "yyyy-MM-dd"));
      if (delError) throw delError;

      // Insert saved shifts
      const savedShifts = (version.shifts_data as any[]).map((s: any) => ({
        date: s.date,
        type: s.type,
        start_time: s.start_time,
        end_time: s.end_time,
        assigned_user_id: s.assigned_user_id,
        is_responsible_on_shift: s.is_responsible_on_shift,
        manager_on_duty_id: s.manager_on_duty_id,
        comments: s.comments,
        is_draft: s.is_draft ?? true,
      }));
      if (savedShifts.length > 0) {
        const { error: insError } = await supabase.from("shifts").insert(savedShifts);
        if (insError) throw insError;
      }

      // Navigate to the loaded week
      setViewStart(startOfWeek(weekStartDate, { weekStartsOn: 0 }));
      // Track this as the current version
      setCurrentVersionId(version.id);
      setCurrentVersionName(version.version_name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster-shifts"] });
      setLoadOpen(false);
      setCompareOpen(false);
      toast.success("Version loaded");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openCreate = (date?: string) => {
    if (date && isDateBlocked(date)) return;
    setEditingShift(null);
    setForm(defaultForm(date));
    setDialogOpen(true);
  };

  const openEdit = (shift: any) => {
    if (isDateBlocked(shift.date)) {
      toast.error("This date is locked. No modifications allowed.");
      return;
    }
    setEditingShift(shift.id);
    setForm({
      date: shift.date,
      type: shift.type,
      start_time: shift.start_time?.slice(0, 5),
      end_time: shift.end_time?.slice(0, 5),
      assigned_user_id: shift.assigned_user_id || "",
      is_responsible_on_shift: shift.is_responsible_on_shift,
      manager_on_duty_id: shift.manager_on_duty_id || "",
      comments: shift.comments || "",
      is_draft: shift.is_draft,
      is_standby: shift.is_standby ?? false,
      is_external: (shift as any).is_external ?? false,
    });
    setDialogOpen(true);
  };

  const handleTypeChange = (type: ShiftType) => {
    setForm((f) => ({ ...f, type, start_time: shiftTimes[type].start, end_time: shiftTimes[type].end }));
  };

  const isBlocked = (userId: string, date: string) =>
    blockedDates.some((b) => {
      if (b.user_id !== userId) return false;
      if (b.end_date) return date >= b.date && date <= b.end_date;
      return b.date === date;
    });

  const getBlockType = (userId: string, date: string): "vacation" | "block" | "leave" | null => {
    const match = blockedDates.find((b) => {
      if (b.user_id !== userId) return false;
      if (b.end_date) return date >= b.date && date <= b.end_date;
      return b.date === date;
    });
    return (match?.request_type as "vacation" | "block" | "leave" | undefined) ?? null;
  };

  const isDateBlocked = (dateStr: string) => hardBlockedDates.includes(dateStr);

  const getStaffForDropdown = () => {
    if (form.is_standby) {
      return staff.filter((s) => {
        const roles = allUserRoles.filter((r) => r.user_id === s.id).map((r) => r.role);
        return roles.includes("manager") || roles.includes("assistant_manager" as any) || s.is_responsible;
      });
    }
    return staff;
  };

  // Friction pre-save check
  const handleSaveWithFriction = async () => {
    if (!form.assigned_user_id) {
      saveShift.mutate();
      return;
    }
    const weekShiftsForUser = shifts.filter(
      (s) => s.assigned_user_id === form.assigned_user_id && (editingShift ? s.id !== editingShift : true)
    ).length;

    // Fetch user's neighboring shifts (±1 day) from DB to validate rest period
    // across week boundaries (e.g. Sunday night → Monday morning).
    const dateObj = new Date(form.date + "T00:00");
    const prevDay = format(new Date(dateObj.getTime() - 86400000), "yyyy-MM-dd");
    const nextDay = format(new Date(dateObj.getTime() + 86400000), "yyyy-MM-dd");
    const { data: neighborShifts } = await supabase
      .from("shifts")
      .select("id, date, start_time, end_time, type, assigned_user_id, is_standby")
      .eq("assigned_user_id", form.assigned_user_id)
      .gte("date", prevDay)
      .lte("date", nextDay);

    const warnings = validateShiftFriction({
      assignedUserId: form.assigned_user_id,
      shiftType: form.type,
      shiftDate: form.date,
      shiftStartTime: form.start_time,
      shiftEndTime: form.end_time,
      isStandby: form.is_standby,
      editingShiftId: editingShift,
      weekShiftsForUser,
      staffProfiles: staff as any[],
      allShifts: (neighborShifts as any[]) ?? [],
    });
    if (warnings.length > 0) {
      setFrictionWarnings(warnings);
      setFrictionOpen(true);
    } else {
      saveShift.mutate();
    }
  };

  const draftCount = shifts.filter((s) => s.is_draft).length;
  const missingResponsible = shifts.filter((s) => !s.is_responsible_on_shift && !s.is_draft);
  const managerStaff = staff.filter((s) => managers.includes(s.id));
  const warningDismissKey = `roster-missing-rn:${format(viewStart, "yyyy-MM-dd")}:${missingResponsible
    .map((shift) => shift.id)
    .sort()
    .join(",")}`;

  const dismissWarning = () => {
    setDismissedWarningKeys((prev) => {
      const next = new Set(prev);
      next.add(warningDismissKey);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(warningStorageKey, JSON.stringify([...next]));
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl md:text-2xl font-bold">{t("roster.shiftManager")}</h1>
        <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
          <TooltipProvider>
            {draftCount > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="sm"
                      onClick={() => setPublishConfirmOpen(true)}
                      disabled={publishDrafts.isPending || (enforceFullWeek && !isFullWeek)}
                    >
                      <Eye className="h-4 w-4 md:mr-1" />
                      <span className="hidden sm:inline">{t("roster.publishCount")} {draftCount}</span>
                    </Button>
                  </span>
                </TooltipTrigger>
                {enforceFullWeek && !isFullWeek && (
                  <TooltipContent>Navigate to a full Sun–Sat week to publish</TooltipContent>
                )}
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setClearWeekConfirmOpen(true)}
                    disabled={shifts.length === 0 || (enforceFullWeek && !isFullWeek)}
                  >
                    <Trash2 className="h-4 w-4 md:mr-1" />
                    <span className="hidden sm:inline">{t("roster.clearWeek")}</span>
                  </Button>
                </span>
              </TooltipTrigger>
              {enforceFullWeek && !isFullWeek && (
                <TooltipContent>Navigate to a full Sun–Sat week to clear</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          <Button size="sm" onClick={() => openCreate()}>
            <Plus className="h-4 w-4 md:mr-1" />
            <span className="hidden sm:inline">{t("roster.addShift")}</span>
          </Button>
        </div>
      </div>

      {missingResponsible.length > 0 && !dismissedWarningKeys.has(warningDismissKey) && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
          <span className="flex-1">{missingResponsible.length} {t("roster.missingRN")}</span>
          <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={dismissWarning}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Shift management toolbar */}
      <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
        {enforceFullWeek && !isFullWeek && (
          <div className="flex items-center gap-2 mr-4 border-r pr-4">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-destructive">{t("roster.fullWeekEnforced")}</span>
          </div>
        )}
        <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
          <Users className="h-4 w-4 md:mr-1" />
          <span className="hidden sm:inline">{t("roster.bulkAssign")}</span>
        </Button>
        {!copiedWeek ? (
          <Button variant="outline" size="sm" onClick={handleCopyWeek} disabled={shifts.length === 0}>
            <Copy className="h-4 w-4 md:mr-1" />
            <span className="hidden sm:inline">{t("roster.copyWeek")}</span>
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => pasteWeek.mutate()} disabled={pasteWeek.isPending}>
            <ClipboardPaste className="h-4 w-4 md:mr-1" />
            <span className="hidden sm:inline">{t("roster.pasteWeek")}</span>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setViewStart(subWeeks(viewStart, 1))} title={locale === "he" ? "שבוע קודם" : "Previous week"}>
              {locale === "he" ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setViewStart(subDays(viewStart, 1))} title={locale === "he" ? "יום קודם" : "Previous day"}>
              {locale === "he" ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </div>
          <CardTitle className="text-base">
            {formatLocale(viewStart, "MMM d", locale)} — {formatLocale(viewEnd, "MMM d, yyyy", locale)}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setViewStart(addDays(viewStart, 1))} title={locale === "he" ? "יום הבא" : "Next day"}>
              {locale === "he" ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setViewStart(addWeeks(viewStart, 1))} title={locale === "he" ? "שבוע הבא" : "Next week"}>
              {locale === "he" ? <ChevronsLeft className="h-4 w-4" /> : <ChevronsRight className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-hidden p-0">
          <div className="relative isolate overflow-x-auto">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[100px] bg-card shadow-[2px_0_8px_-4px_hsl(var(--foreground)/0.18)] md:w-[140px]"
            />
            <table className="w-max min-w-full border-separate border-spacing-0 text-xs md:text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-30 w-[100px] min-w-[100px] border-r border-b border-border/30 bg-card py-4 px-1.5 text-left font-medium text-muted-foreground shadow-[2px_0_8px_-4px_hsl(var(--foreground)/0.18)] md:w-[140px] md:min-w-[140px] md:py-5 md:px-2">{t("roster.staff")}</th>
                {days.map((d) => {
                  const dateStr = format(d, "yyyy-MM-dd");
                  const dateBlocked = isDateBlocked(dateStr);
                  return (
                    <th key={d.toISOString()} className={`relative z-10 min-w-[70px] md:min-w-[120px] py-4 px-1 md:py-5 md:px-2 text-center font-medium text-muted-foreground border-b border-r border-border/30 ${dateBlocked ? "bg-muted/50" : ""}`}>
                      <div className="flex items-center justify-center gap-1">
                        {formatLocale(d, "EEE", locale)}
                        {dateBlocked && <Lock className="h-3 w-3" />}
                      </div>
                      <div className="text-[10px] md:text-xs mb-1">{formatLocale(d, "MMM d", locale)}</div>
                      {/* Fulfillment summary per shift type */}
                      <div className="flex flex-col gap-0.5">
                        {(["morning", "evening", "night"] as const).map((st) => {
                          const target = getHeadcountTarget(st, dateStr, headcountLimits);
                          const count = shifts.filter(
                            (s) => s.date === dateStr && s.type === st && s.assigned_user_id && !(s as any).is_standby
                          ).length;
                          const met = count >= target;
                          const over = count > target;
                          return (
                            <div
                              key={st}
                              className={`text-[8px] md:text-[9px] rounded-sm px-0.5 md:px-1 py-px font-medium ${
                                over
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                  : met
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {t(`shift.${st}`).charAt(0)}: {count}/{target}
                              {met && !over && " ✓"}
                            </div>
                          );
                        })}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.id} className="border-t">
                  <td className={`sticky left-0 z-20 w-[100px] min-w-[100px] overflow-hidden border-r py-3 px-1.5 font-medium shadow-[2px_0_8px_-4px_hsl(var(--foreground)/0.18)] md:w-[140px] md:min-w-[140px] md:py-4 md:px-2 ${isAssistant(member.role ?? member.app_role) ? "bg-muted/60" : "bg-card"}`}>
                    <div className="max-w-[100px] md:max-w-[160px]">
                      <span className={`truncate block text-xs md:text-sm ${isAssistant(member.role ?? member.app_role) ? "text-muted-foreground" : ""}`}>{member.full_name}</span>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        <span className="text-[10px] md:text-xs text-muted-foreground">{Math.round(Number(member.target_fte_percent) * 100)}%</span>
                        {member.is_responsible && <Star className="h-3 w-3 fill-primary text-primary flex-shrink-0" />}
                        {isAssistant(member.role ?? member.app_role) && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 bg-muted text-muted-foreground border-muted-foreground/20">Assistant</Badge>
                        )}
                        {member.kind === "pending" && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 bg-amber-50 text-amber-800 border-amber-200">Pending</Badge>
                        )}
                      </div>
                    </div>
                  </td>
                  {days.map((d) => {
                    const dateStr = format(d, "yyyy-MM-dd");
                    const dayShifts = shifts.filter(
                      (s) => s.assigned_user_id === member.id && s.date === dateStr
                    );
                    const blocked = isBlocked(member.id, dateStr);
                    const dateBlocked = isDateBlocked(dateStr);
                    return (
                      <td
                        key={d.toISOString()}
                        className={`relative z-0 py-3 px-1 text-center transition-colors border-b border-r border-border/20 ${dateBlocked || blocked ? "bg-muted/30 roster-ghosted cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-accent/30"}`}
                        onClick={() => {
                          if (dateBlocked || blocked) return;
                          if (dayShifts.length === 0) {
                            setEditingShift(null);
                            setForm({ ...defaultForm(dateStr), assigned_user_id: member.id });
                            setDialogOpen(true);
                          }
                        }}
                      >
                        {dateBlocked && dayShifts.length === 0 && !blocked && (
                          <span className="text-[10px] text-muted-foreground">🔒</span>
                        )}
                        {blocked && dayShifts.length === 0 && (
                          <span className="text-[10px] text-destructive">
                            {(() => { const bt = getBlockType(member.id, dateStr); return bt === "vacation" ? t("common.vacation") : bt === "leave" ? t("common.leave") : t("roster.blocked"); })()}
                          </span>
                        )}
                        {dayShifts.map((s) => {
                          const isExternal = (s as any).is_external;
                          return (
                          <div
                            key={s.id}
                            onClick={(e) => { e.stopPropagation(); openEdit(s); }}
                            className={`relative mb-0.5 rounded-sm px-1 py-0.5 text-xs shadow-none ${dateBlocked ? "cursor-not-allowed" : "cursor-pointer hover:ring-1 hover:ring-primary/50"} transition-all ${
                              isExternal
                                ? "bg-slate-50 border border-slate-200 text-slate-400 opacity-80"
                                : (s as any).is_standby
                                ? "bg-blue-50/60 border-l-4 border-blue-400 border-t-0 border-r-0 border-b-0 text-foreground"
                                : s.is_draft
                                  ? `${shiftBgDraft[s.type]} opacity-70 border border-dashed ${s.type === "morning" ? "border-s-shift-morning" : s.type === "evening" ? "border-s-shift-evening" : "border-s-shift-night"} border-s-2`
                                  : `${shiftBgPublished[s.type]} border-s-2 ${s.type === "morning" ? "border-s-shift-morning" : s.type === "evening" ? "border-s-shift-evening" : "border-s-shift-night"}`
                            }`}
                          >
                            {s.is_responsible_on_shift && !isExternal && (
                              <Star className="absolute top-0.5 end-0.5 h-2.5 w-2.5 fill-primary text-primary" />
                            )}
                            <div className="flex items-center justify-center gap-0.5">
                              {isExternal && <ArrowLeftRight className="h-2.5 w-2.5" />}
                              <span className="capitalize font-medium">{s.type.charAt(0)}</span>
                              {(s as any).is_standby && (
                                <Phone className="h-2.5 w-2.5 text-blue-500" />
                              )}
                            </div>
                          </div>
                          );
                        })}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Unassigned shifts row */}
              {shifts.some((s) => !s.assigned_user_id) && (
                <tr className="border-t bg-muted/30">
                  <td className="sticky left-0 z-20 w-[100px] min-w-[100px] overflow-hidden border-r bg-muted/30 p-2 font-medium text-muted-foreground italic shadow-[2px_0_8px_-4px_hsl(var(--foreground)/0.12)] md:w-[140px] md:min-w-[140px]">{t("roster.unassigned")}</td>
                  {days.map((d) => {
                    const dateStr = format(d, "yyyy-MM-dd");
                    const unassigned = shifts.filter((s) => !s.assigned_user_id && s.date === dateStr);
                    return (
                      <td key={d.toISOString()} className="p-1 text-center border-b border-r border-border/20">
                        {unassigned.map((s) => (
                          <div
                            key={s.id}
                            onClick={() => openEdit(s)}
                            className={`mb-1 rounded-sm border px-1.5 py-1 text-xs cursor-pointer hover:ring-1 hover:ring-primary/50 ${shiftBgDraft[s.type]} opacity-60`}
                          >
                            <span className="capitalize font-medium">{s.type.charAt(0)}</span>
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              )}
            </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Draft version management — bottom toolbar */}
      <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-muted/30 p-3">
         <span className="text-sm font-medium text-muted-foreground mr-2">
          {t("roster.versions")}{currentVersionName ? `: ${currentVersionName}` : ""}
        </span>
        <Button variant="outline" size="sm" onClick={handleSave} disabled={shifts.length === 0}>
          <Save className="mr-1 h-4 w-4" />
          {t("common.save")}
        </Button>
        <Button variant="outline" size="sm" onClick={handleOpenSaveAs} disabled={shifts.length === 0}>
          <Save className="mr-1 h-4 w-4" />
          {t("roster.saveAs")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setLoadOpen(true); refetchVersions(); }}>
          <FolderOpen className="mr-1 h-4 w-4" />
          {t("roster.loadVersion")}
        </Button>
      </div>

      <BulkAssignDialog open={bulkOpen} onOpenChange={setBulkOpen} staff={staff} blockedDates={blockedDates} />

      {/* Save As dialog */}
      <Dialog open={saveAsOpen} onOpenChange={setSaveAsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("roster.saveVersionAs")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("roster.versionName")}</Label>
              <Input value={saveAsName} onChange={(e) => setSaveAsName(e.target.value)} placeholder="draft_2026-04-06_v1" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setSaveAsOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={handleSaveAs} disabled={!saveAsName.trim()}>{t("common.save")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Load Version dialog */}
      <Dialog open={loadOpen} onOpenChange={setLoadOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("roster.loadSavedVersion")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {savedVersions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t("roster.noVersions")}</p>
            ) : (
              savedVersions.map((v: any) => (
                <div key={v.id} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/30 transition-colors">
                  <div>
                    <p className="text-sm font-medium">{v.version_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Week of {v.week_start_date} · {(v.shifts_data as any[]).length} shifts · {format(new Date(v.created_at), "MMM d, HH:mm")}
                    </p>
                  </div>
                   <Button size="sm" variant="outline" onClick={() => handleLoadVersionClick(v)} disabled={loadVersion.isPending}>
                    {t("roster.load")}
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Shift create/edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) setSaveError(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingShift ? t("roster.editShift") : t("roster.createShift")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("roster.date")}</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("roster.type")}</Label>
                <Select value={form.type} onValueChange={(v) => handleTypeChange(v as ShiftType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                     <SelectItem value="morning">{t("shift.morning")}</SelectItem>
                    <SelectItem value="evening">{t("shift.evening")}</SelectItem>
                    <SelectItem value="night">{t("shift.night")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("roster.startTime")}</Label>
                <Input type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("roster.endTime")}</Label>
                <Input type="time" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>{t("roster.onCallShift")}</Label>
              <Switch checked={form.is_standby} onCheckedChange={(v) => setForm((f) => ({ ...f, is_standby: v, assigned_user_id: "" }))} />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{locale === "he" ? "מחוץ למחלקה" : "Not at Ward"}</Label>
                <p className="text-xs text-muted-foreground">
                  {locale === "he" ? "לא נספר במכסת המחלקה, אך נספר ב-FTE" : "Excluded from ward headcount, still counts toward FTE"}
                </p>
              </div>
              <Switch checked={form.is_external} onCheckedChange={(v) => setForm((f) => ({ ...f, is_external: v }))} />
            </div>

            <div className="space-y-2">
              <Label>{t("roster.assignToStaff")}</Label>
              <Select value={form.assigned_user_id || "__unassigned__"} onValueChange={(v) => setForm((f) => ({ ...f, assigned_user_id: v === "__unassigned__" ? "" : v }))}>
                 <SelectTrigger><SelectValue placeholder={t("roster.unassigned")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">{t("roster.unassigned")}</SelectItem>
                  {getStaffForDropdown().map((s) => {
                    const blocked = isBlocked(s.id, form.date);
                    const blockType = blocked ? getBlockType(s.id, form.date) : null;
                    const blockLabel = blockType === "vacation" ? t("common.vacation") : blockType === "leave" ? t("common.leave") : t("roster.blocked");
                    return (
                      <SelectItem key={s.id} value={s.id} disabled={blocked}>
                        {s.full_name}{s.kind === "pending" ? " (Pending)" : ""} {blocked ? `🚫 ${blockLabel}` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {form.is_standby && <p className="text-xs text-muted-foreground">{t("roster.onCallHint")}</p>}
            </div>

            <div className="flex items-center justify-between">
              <Label>{t("roster.responsibleNurse")}</Label>
              <Switch checked={form.is_responsible_on_shift} onCheckedChange={(v) => setForm((f) => ({ ...f, is_responsible_on_shift: v }))} />
            </div>

            <div className="flex items-center justify-between">
              <Label>{t("roster.draft")}</Label>
              <Switch checked={form.is_draft} onCheckedChange={(v) => setForm((f) => ({ ...f, is_draft: v }))} />
            </div>

            <div className="space-y-2">
              <Label>{t("roster.comments")}</Label>
              <Textarea value={form.comments} onChange={(e) => setForm((f) => ({ ...f, comments: e.target.value }))} placeholder="Optional notes..." rows={2} />
            </div>

            {saveError && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{saveError}</span>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              {editingShift && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => { deleteShift.mutate(editingShift); setDialogOpen(false); }}
                >
                   <Trash2 className="mr-1 h-4 w-4" />
                  {t("roster.delete")}
                </Button>
              )}
               <Button variant="ghost" onClick={() => { setDialogOpen(false); setSaveError(null); }}>{t("common.cancel")}</Button>
              <Button onClick={handleSaveWithFriction} disabled={saveShift.isPending}>
                {editingShift ? t("roster.update") : t("roster.create")} {t("roster.shift")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Clear Week Confirmation */}
      {(() => {
        const draftCount2 = shifts.filter((s) => s.is_draft).length;
        const publishedCount = shifts.filter((s) => !s.is_draft).length;
        return (
          <AlertDialog open={clearWeekConfirmOpen} onOpenChange={setClearWeekConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <Trash2 className="h-5 w-5 text-destructive" />
                  {t("roster.clearDrafts")}
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div>
                    <p>This will remove <strong>{draftCount2}</strong> draft shift{draftCount2 !== 1 ? "s" : ""} from {format(viewStart, "MMM d")} to {format(viewEnd, "MMM d, yyyy")}.</p>
                    {publishedCount > 0 && (
                      <p className="mt-2 text-sm font-medium text-foreground">{publishedCount} published shift{publishedCount !== 1 ? "s" : ""} will remain untouched for safety.</p>
                    )}
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => clearWeek.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={draftCount2 === 0}
                >
                  {draftCount2 === 0 ? "No drafts to clear" : `Delete ${draftCount2} Draft${draftCount2 !== 1 ? "s" : ""}`}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })()}

      <FrictionDialog
        open={frictionOpen}
        onOpenChange={setFrictionOpen}
        warnings={frictionWarnings}
        onConfirm={() => { setFrictionOpen(false); saveShift.mutate(); }}
        isPending={saveShift.isPending}
      />

      <PublishConfirmDialog
        open={publishConfirmOpen}
        onOpenChange={setPublishConfirmOpen}
        drafts={shifts.filter((s) => s.is_draft)}
        allShifts={shifts}
        onConfirm={() => {
          publishDrafts.mutate();
          setPublishConfirmOpen(false);
        }}
        isPending={publishDrafts.isPending}
        staffProfiles={staff as any[]}
        headcountLimits={headcountLimits}
      />

      <VersionCompareDialog
        open={compareOpen}
        onOpenChange={setCompareOpen}
        versionName={compareVersion?.version_name || ""}
        diffs={compareDiffs}
        onConfirm={() => {
          if (compareVersion) loadVersion.mutate(compareVersion);
        }}
        isPending={loadVersion.isPending}
      />

      {/* Info confirmation popup */}
      <AlertDialog open={!!infoPopup} onOpenChange={(open) => !open && setInfoPopup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{infoPopup?.title}</AlertDialogTitle>
            <AlertDialogDescription>{infoPopup?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setInfoPopup(null)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
