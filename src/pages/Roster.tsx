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
import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Eye, EyeOff, AlertTriangle, Plus, Trash2, Copy, ClipboardPaste, Users, Star, Save, FolderOpen, Lock, Settings } from "lucide-react";
import { BulkAssignDialog } from "@/components/roster/BulkAssignDialog";
import { PublishConfirmDialog } from "@/components/roster/PublishConfirmDialog";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
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
  evening: { start: "15:00", end: "23:00" },
  night: { start: "23:00", end: "07:00" },
};

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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [viewStart, setViewStart] = useState(startOfWeek(new Date(), { weekStartsOn: 0 }));
  const viewEnd = addDays(viewStart, 6);
  const days = eachDayOfInterval({ start: viewStart, end: viewEnd });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<string | null>(null);
  const [form, setForm] = useState<ShiftFormData>(defaultForm());

  // Copy/Paste state
  const [copiedWeek, setCopiedWeek] = useState<CopiedWeek | null>(null);

  // Save As dialog
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");

  // Load version dialog
  const [loadOpen, setLoadOpen] = useState(false);

  // Track current version for "Save" (overwrite)
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);
  const [currentVersionName, setCurrentVersionName] = useState<string | null>(null);

  // Full-week enforcement
  const [enforceFullWeek, setEnforceFullWeek] = useState(true);
  const isFullWeek = getDay(viewStart) === 0; // Sunday start
  const [clearWeekConfirmOpen, setClearWeekConfirmOpen] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);

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

  const { data: staff = [] } = useQuery({
    queryKey: ["all-staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, is_active, is_responsible, target_fte_percent")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

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
        .select("user_id, date")
        .eq("status", "approved")
        .gte("date", format(viewStart, "yyyy-MM-dd"))
        .lte("date", format(viewEnd, "yyyy-MM-dd"));
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
      toast.success(editingShift ? "Shift updated" : "Shift created");
    },
    onError: (e: any) => toast.error(e.message),
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
      const draftIds = shifts.filter((s) => s.is_draft).map((s) => s.id);
      if (draftIds.length === 0) return;
      const { error } = await supabase.from("shifts").update({ is_draft: false }).in("id", draftIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster-shifts"] });
      toast.success("Schedule published!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const clearWeek = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("shifts")
        .delete()
        .gte("date", format(viewStart, "yyyy-MM-dd"))
        .lte("date", format(viewEnd, "yyyy-MM-dd"));
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster-shifts"] });
      toast.success("Week cleared");
      setClearWeekConfirmOpen(false);
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
    toast.success("Week copied! Navigate to target week and paste.");
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
      toast.success("Week pasted as drafts");
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

  // Load a saved version
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
      toast.success("Version loaded");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openCreate = (date?: string) => {
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
    });
    setDialogOpen(true);
  };

  const handleTypeChange = (type: ShiftType) => {
    setForm((f) => ({ ...f, type, start_time: shiftTimes[type].start, end_time: shiftTimes[type].end }));
  };

  const isBlocked = (userId: string, date: string) =>
    blockedDates.some((b) => b.user_id === userId && b.date === date);

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

  const draftCount = shifts.filter((s) => s.is_draft).length;
  const missingResponsible = shifts.filter((s) => !s.is_responsible_on_shift && !s.is_draft);
  const managerStaff = staff.filter((s) => managers.includes(s.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Master Roster</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {draftCount > 0 && (
            <Button
              size="sm"
              onClick={() => setPublishConfirmOpen(true)}
              disabled={publishDrafts.isPending || (enforceFullWeek && !isFullWeek)}
              title={enforceFullWeek && !isFullWeek ? "Navigate to a full Sun–Sat week to publish" : undefined}
            >
              <Eye className="mr-1 h-4 w-4" />
              Publish {draftCount} Draft{draftCount > 1 ? "s" : ""}
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setClearWeekConfirmOpen(true)}
            disabled={shifts.length === 0 || (enforceFullWeek && !isFullWeek)}
            title={enforceFullWeek && !isFullWeek ? "Navigate to a full Sun–Sat week to clear" : undefined}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Clear Week
          </Button>
          <Button size="sm" onClick={() => openCreate()}>
            <Plus className="mr-1 h-4 w-4" />
            Add Shift
          </Button>
        </div>
      </div>

      {missingResponsible.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <span>{missingResponsible.length} published shift(s) missing a Responsible Nurse</span>
        </div>
      )}

      {/* Shift management toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 mr-4 border-r pr-4">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <Label htmlFor="enforce-full-week" className="text-xs text-muted-foreground cursor-pointer">Full week only</Label>
          <Switch id="enforce-full-week" checked={enforceFullWeek} onCheckedChange={setEnforceFullWeek} />
          {enforceFullWeek && !isFullWeek && (
            <span className="text-xs text-destructive">Not a Sun–Sat week</span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
          <Users className="mr-1 h-4 w-4" />
          Bulk Assign
        </Button>
        {!copiedWeek ? (
          <Button variant="outline" size="sm" onClick={handleCopyWeek} disabled={shifts.length === 0}>
            <Copy className="mr-1 h-4 w-4" />
            Copy Week
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => pasteWeek.mutate()} disabled={pasteWeek.isPending}>
            <ClipboardPaste className="mr-1 h-4 w-4" />
            Paste Week
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setViewStart(subWeeks(viewStart, 1))} title="Previous week">
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setViewStart(subDays(viewStart, 1))} title="Previous day">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
          <CardTitle className="text-base">
            {format(viewStart, "MMM d")} — {format(viewEnd, "MMM d, yyyy")}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setViewStart(addDays(viewStart, 1))} title="Next day">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setViewStart(addWeeks(viewStart, 1))} title="Next week">
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card p-2 text-left font-medium text-muted-foreground min-w-[140px]">Staff</th>
                {days.map((d) => (
                  <th key={d.toISOString()} className="min-w-[120px] p-2 text-center font-medium text-muted-foreground">
                    <div>{format(d, "EEE")}</div>
                    <div className="text-xs">{format(d, "MMM d")}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.id} className="border-t">
                  <td className="sticky left-0 z-10 bg-card p-2 font-medium">
                    <div className="flex items-center gap-1 max-w-[160px]">
                      <span className="truncate">{member.full_name}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">{Math.round(Number(member.target_fte_percent) * 100)}%</span>
                      {member.is_responsible && <Star className="h-3 w-3 fill-primary text-primary flex-shrink-0" />}
                    </div>
                  </td>
                  {days.map((d) => {
                    const dateStr = format(d, "yyyy-MM-dd");
                    const dayShifts = shifts.filter(
                      (s) => s.assigned_user_id === member.id && s.date === dateStr
                    );
                    const blocked = isBlocked(member.id, dateStr);
                    return (
                      <td
                        key={d.toISOString()}
                        className={`p-1 text-center cursor-pointer hover:bg-accent/30 transition-colors ${blocked ? "bg-destructive/5" : ""}`}
                        onClick={() => {
                          if (dayShifts.length === 0) {
                            setEditingShift(null);
                            setForm({ ...defaultForm(dateStr), assigned_user_id: member.id });
                            setDialogOpen(true);
                          }
                        }}
                      >
                        {blocked && dayShifts.length === 0 && (
                          <span className="text-[10px] text-destructive">Blocked</span>
                        )}
                        {dayShifts.map((s) => (
                          <div
                            key={s.id}
                            onClick={(e) => { e.stopPropagation(); openEdit(s); }}
                            className={`mb-1 rounded border px-1.5 py-1 text-xs cursor-pointer hover:ring-1 hover:ring-primary/50 transition-all ${
                              s.is_draft ? shiftBgDraft[s.type] + " opacity-60" : shiftBgPublished[s.type]
                            }`}
                          >
                            <div className="flex items-center justify-center gap-0.5">
                              <span className="capitalize font-medium">{s.type.charAt(0)}</span>
                              {s.is_responsible_on_shift && (
                                <span className="text-[9px] font-bold bg-primary/20 text-primary rounded px-0.5">RN</span>
                              )}
                              {s.is_draft ? <EyeOff className="h-2.5 w-2.5 opacity-60" /> : <Lock className="h-2.5 w-2.5 opacity-40" />}
                            </div>
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Unassigned shifts row */}
              {shifts.some((s) => !s.assigned_user_id) && (
                <tr className="border-t bg-muted/30">
                  <td className="sticky left-0 z-10 bg-muted/30 p-2 font-medium text-muted-foreground italic">Unassigned</td>
                  {days.map((d) => {
                    const dateStr = format(d, "yyyy-MM-dd");
                    const unassigned = shifts.filter((s) => !s.assigned_user_id && s.date === dateStr);
                    return (
                      <td key={d.toISOString()} className="p-1 text-center">
                        {unassigned.map((s) => (
                          <div
                            key={s.id}
                            onClick={() => openEdit(s)}
                            className={`mb-1 rounded border px-1.5 py-1 text-xs cursor-pointer hover:ring-1 hover:ring-primary/50 ${shiftBgDraft[s.type]} opacity-60`}
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
        </CardContent>
      </Card>

      {/* Draft version management — bottom toolbar */}
      <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-muted/30 p-3">
        <span className="text-sm font-medium text-muted-foreground mr-2">
          Versions{currentVersionName ? `: ${currentVersionName}` : ""}
        </span>
        <Button variant="outline" size="sm" onClick={handleSave} disabled={shifts.length === 0}>
          <Save className="mr-1 h-4 w-4" />
          Save
        </Button>
        <Button variant="outline" size="sm" onClick={handleOpenSaveAs} disabled={shifts.length === 0}>
          <Save className="mr-1 h-4 w-4" />
          Save As…
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setLoadOpen(true); refetchVersions(); }}>
          <FolderOpen className="mr-1 h-4 w-4" />
          Load Version
        </Button>
      </div>

      <BulkAssignDialog open={bulkOpen} onOpenChange={setBulkOpen} staff={staff} blockedDates={blockedDates} />

      {/* Save As dialog */}
      <Dialog open={saveAsOpen} onOpenChange={setSaveAsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save Version As</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Version Name</Label>
              <Input value={saveAsName} onChange={(e) => setSaveAsName(e.target.value)} placeholder="draft_2026-04-06_v1" />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSaveAs} disabled={!saveAsName.trim()}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Load Version dialog */}
      <Dialog open={loadOpen} onOpenChange={setLoadOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Load Saved Version</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {savedVersions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No saved versions yet.</p>
            ) : (
              savedVersions.map((v: any) => (
                <div key={v.id} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/30 transition-colors">
                  <div>
                    <p className="text-sm font-medium">{v.version_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Week of {v.week_start_date} · {(v.shifts_data as any[]).length} shifts · {format(new Date(v.created_at), "MMM d, HH:mm")}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => loadVersion.mutate(v)} disabled={loadVersion.isPending}>
                    Load
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Shift create/edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingShift ? "Edit Shift" : "Create Shift"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => handleTypeChange(v as ShiftType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="morning">Morning</SelectItem>
                    <SelectItem value="evening">Evening</SelectItem>
                    <SelectItem value="night">Night</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input type="time" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Assign to Staff</Label>
              <Select value={form.assigned_user_id || "__unassigned__"} onValueChange={(v) => setForm((f) => ({ ...f, assigned_user_id: v === "__unassigned__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">Unassigned</SelectItem>
                  {staff.map((s) => {
                    const blocked = isBlocked(s.id, form.date);
                    return (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name} {blocked ? "⚠️ Blocked" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Manager on Duty</Label>
              <Select value={form.manager_on_duty_id || "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, manager_on_duty_id: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {managerStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label>Responsible Nurse</Label>
              <Switch checked={form.is_responsible_on_shift} onCheckedChange={(v) => setForm((f) => ({ ...f, is_responsible_on_shift: v }))} />
            </div>

            <div className="flex items-center justify-between">
              <Label>Draft</Label>
              <Switch checked={form.is_draft} onCheckedChange={(v) => setForm((f) => ({ ...f, is_draft: v }))} />
            </div>

            <div className="space-y-2">
              <Label>Comments</Label>
              <Textarea value={form.comments} onChange={(e) => setForm((f) => ({ ...f, comments: e.target.value }))} placeholder="Optional notes..." rows={2} />
            </div>

            <div className="flex gap-2 justify-end">
              {editingShift && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => { deleteShift.mutate(editingShift); setDialogOpen(false); }}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Delete
                </Button>
              )}
              <Button onClick={() => saveShift.mutate()} disabled={saveShift.isPending}>
                {editingShift ? "Update" : "Create"} Shift
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Clear Week Confirmation */}
      <AlertDialog open={clearWeekConfirmOpen} onOpenChange={setClearWeekConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear entire week?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all shifts from {format(viewStart, "MMM d")} to {format(viewEnd, "MMM d, yyyy")}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearWeek.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete All Shifts
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
      />
    </div>
  );
}
