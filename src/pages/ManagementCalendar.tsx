import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval } from "date-fns";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Users, Star, Trash2, Eye, Lock, ShieldAlert, AlertTriangle } from "lucide-react";
import { BulkAssignDialog } from "@/components/roster/BulkAssignDialog";
import { FrictionDialog, type FrictionWarning } from "@/components/roster/FrictionDialog";
import { validateShiftFriction, isOverHeadcount, getHeadcountTarget } from "@/components/roster/frictionValidation";
import { useAppSettings } from "@/hooks/useAppSettings";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type ShiftType = Database["public"]["Enums"]["shift_type"];

const shiftTypes = ["morning", "evening", "night"] as const;

const shiftLabels: Record<string, string> = {
  morning: "Morning",
  evening: "Evening",
  night: "Night",
};

const shiftColors: Record<string, string> = {
  morning: "bg-shift-morning/10 border-shift-morning/30",
  evening: "bg-shift-evening/10 border-shift-evening/30",
  night: "bg-shift-night/10 border-shift-night/30",
};

const shiftTextColors: Record<string, string> = {
  morning: "text-shift-morning",
  evening: "text-shift-evening",
  night: "text-shift-night",
};

const shiftTimes: Record<ShiftType, { start: string; end: string }> = {
  morning: { start: "07:00", end: "15:00" },
  evening: { start: "14:30", end: "23:00" },
  night: { start: "22:30", end: "07:00" },
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

const defaultForm = (date?: string, type?: ShiftType): ShiftFormData => ({
  date: date || format(new Date(), "yyyy-MM-dd"),
  type: type || "morning",
  start_time: shiftTimes[type || "morning"].start,
  end_time: shiftTimes[type || "morning"].end,
  assigned_user_id: "",
  is_responsible_on_shift: false,
  manager_on_duty_id: "",
  comments: "",
  is_draft: true,
  is_standby: false,
});

export default function ManagementCalendar() {
  const { headcountLimits } = useAppSettings();
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 0 }));
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDate, setBulkDate] = useState<string | undefined>();
  const [bulkType, setBulkType] = useState<ShiftType | undefined>();
  const [form, setForm] = useState<ShiftFormData>(defaultForm());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [frictionWarnings, setFrictionWarnings] = useState<FrictionWarning[]>([]);
  const [frictionOpen, setFrictionOpen] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailDate, setDetailDate] = useState("");
  const [detailType, setDetailType] = useState<ShiftType>("morning");

  const { data: shifts = [] } = useQuery({
    queryKey: ["mgmt-calendar-shifts", format(weekStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*, profiles:shifts_assigned_user_id_fkey(full_name)")
        .gte("date", format(weekStart, "yyyy-MM-dd"))
        .lte("date", format(weekEnd, "yyyy-MM-dd"))
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
        .select("id, full_name, is_active, is_responsible, target_fte_percent, constraints")
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
    queryKey: ["approved-blocks", format(weekStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_requests")
        .select("user_id, date, end_date")
        .eq("status", "approved")
        .lte("date", format(weekEnd, "yyyy-MM-dd"))
        .or(`end_date.gte.${format(weekStart, "yyyy-MM-dd")},end_date.is.null`);
      if (error) throw error;
      return data;
    },
  });

  // Fetch hard-locked dates
  const { data: hardBlockedDates = [] } = useQuery({
    queryKey: ["blocked-dates", format(weekStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blocked_dates")
        .select("date")
        .gte("date", format(weekStart, "yyyy-MM-dd"))
        .lte("date", format(weekEnd, "yyyy-MM-dd"));
      if (error) throw error;
      return data?.map((d) => d.date) ?? [];
    },
  });

  // Fetch user_roles for standby filtering
  const { data: allUserRoles = [] } = useQuery({
    queryKey: ["all-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data;
    },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["mgmt-calendar-shifts"] });
    queryClient.invalidateQueries({ queryKey: ["roster-shifts"] });
  };

  const isDateBlocked = (dateStr: string) => hardBlockedDates.includes(dateStr);

  const saveShift = useMutation({
    mutationFn: async () => {
      const payload: any = {
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
      invalidateAll();
      setDialogOpen(false);
      setEditingShift(null);
      setSaveError(null);
      toast.success(editingShift ? "Shift updated" : "Shift created");
    },
    onError: (e: any) => { setSaveError(e.message); toast.error(e.message); },
  });

  const toggleResponsible = useMutation({
    mutationFn: async ({ shiftId, value }: { shiftId: string; value: boolean }) => {
      const { error } = await supabase.from("shifts").update({ is_responsible_on_shift: value }).eq("id", shiftId);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); toast.success("Updated responsible status"); },
    onError: (e: any) => toast.error(e.message),
  });

  const removeShift = useMutation({
    mutationFn: async (shiftId: string) => {
      const { error } = await supabase.from("shifts").delete().eq("id", shiftId);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); toast.success("Shift deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleTypeChange = (t: ShiftType) => {
    setForm((f) => ({ ...f, type: t, start_time: shiftTimes[t].start, end_time: shiftTimes[t].end }));
  };

  const openAddShift = (date?: string, type?: ShiftType) => {
    if (date && isDateBlocked(date)) return;
    setEditingShift(null);
    setForm(defaultForm(date, type));
    setDialogOpen(true);
  };

  const openEditShift = (shift: any) => {
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
      is_standby: (shift as any).is_standby ?? false,
    });
    setDialogOpen(true);
  };

  const getFirstName = (shift: any): string => {
    const fullName = shift.profiles?.full_name;
    if (!fullName) return "?";
    return fullName.split(" ")[0];
  };

  const handleCellClick = (dateStr: string, type: ShiftType) => {
    if (isDateBlocked(dateStr)) return;
    const dayShifts = shifts.filter((s) => s.date === dateStr && s.type === type && s.assigned_user_id);
    if (dayShifts.length === 0) {
      setBulkDate(dateStr);
      setBulkType(type);
      setBulkOpen(true);
    } else {
      setDetailDate(dateStr);
      setDetailType(type);
      setDetailOpen(true);
    }
  };

  const detailShifts = shifts.filter((s) => s.date === detailDate && s.type === detailType && s.assigned_user_id);
  const managerStaff = staff.filter((s) => managers.includes(s.id));

  // Standby-eligible staff: managers, assistant_managers, or is_responsible
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
  const handleSaveWithFriction = () => {
    if (!form.assigned_user_id) {
      saveShift.mutate();
      return;
    }
    const weekShiftsForUser = shifts.filter(
      (s) => s.assigned_user_id === form.assigned_user_id && (editingShift ? s.id !== editingShift : true)
    ).length;
    const warnings = validateShiftFriction({
      assignedUserId: form.assigned_user_id,
      shiftType: form.type,
      shiftDate: form.date,
      weekShiftsForUser,
      staffProfiles: staff as any[],
    });
    if (warnings.length > 0) {
      setFrictionWarnings(warnings);
      setFrictionOpen(true);
    } else {
      saveShift.mutate();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Management Calendar</h1>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => { setBulkDate(undefined); setBulkType(undefined); setBulkOpen(true); }}>
            <Users className="h-4 w-4 mr-2" />
            Bulk Assign
          </Button>
          <Button onClick={() => openAddShift()}>
            <Plus className="h-4 w-4 mr-2" />
            Add Shift
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <Button variant="ghost" size="icon" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <CardTitle className="text-base">
            {format(weekStart, "MMM d")} — {format(weekEnd, "MMM d, yyyy")}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card p-2 text-left font-medium text-muted-foreground min-w-[90px] border-b">Shift</th>
                {days.map((d) => {
                  const dateStr = format(d, "yyyy-MM-dd");
                  const blocked = isDateBlocked(dateStr);
                  return (
                    <th key={d.toISOString()} className={`min-w-[140px] p-2 text-center font-medium text-muted-foreground border-b ${blocked ? "bg-gray-200/50" : ""}`}>
                      <div className="flex items-center justify-center gap-1">
                        {format(d, "EEE")}
                        {blocked && <Lock className="h-3 w-3 text-muted-foreground" />}
                      </div>
                      <div className="text-xs">{format(d, "MMM d")}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {shiftTypes.map((type) => (
                <tr key={type} className="border-t">
                  <td className={`sticky left-0 z-10 bg-card p-2 font-semibold ${shiftTextColors[type]}`}>{shiftLabels[type]}</td>
                  {days.map((d) => {
                    const dateStr = format(d, "yyyy-MM-dd");
                    const blocked = isDateBlocked(dateStr);
                    const dayShifts = shifts.filter((s) => s.date === dateStr && s.type === type && s.assigned_user_id);
                    const overHeadcount = isOverHeadcount(shifts as any[], dateStr, type, headcountLimits);
                    return (
                      <td
                        key={d.toISOString()}
                        className={`p-2 border-l align-top ${blocked ? "bg-gray-200/50 cursor-not-allowed" : `${shiftColors[type]} cursor-pointer hover:opacity-80`} ${overHeadcount ? "ring-2 ring-inset ring-amber-400/60" : ""}`}
                        onClick={() => !blocked && handleCellClick(dateStr, type)}
                      >
                        {overHeadcount && (
                          <div className="flex items-center gap-0.5 mb-1">
                            <AlertTriangle className="h-3 w-3 text-amber-500" />
                            <span className="text-[9px] text-amber-600 font-medium">{dayShifts.filter(s => !(s as any).is_standby).length}/{getHeadcountTarget(type, dateStr, headcountLimits)}</span>
                          </div>
                        )}
                        {dayShifts.length === 0 ? (
                          <span className="text-xs text-muted-foreground italic">{blocked ? "🔒" : "—"}</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {dayShifts.map((s) => (
                              <Badge
                                key={s.id}
                                variant={s.is_responsible_on_shift ? "default" : "secondary"}
                                className={`text-xs ${s.is_responsible_on_shift ? "font-bold" : "font-normal"} ${
                                  (s as any).is_standby
                                    ? "bg-transparent border-2 border-dashed border-current"
                                    : s.is_draft ? "opacity-60 border-dashed" : "ring-1 ring-current/20"
                                }`}
                              >
                                {getFirstName(s)}
                                {s.is_responsible_on_shift && <span className="ml-0.5 text-[9px]">★</span>}
                                {(s as any).is_standby && <span className="ml-0.5 text-[9px] font-bold">OC</span>}
                                {s.is_draft ? <span className="ml-0.5 text-[9px]">D</span> : <Lock className="ml-0.5 h-2.5 w-2.5 opacity-40" />}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        <div className="flex items-center gap-1">
          <Badge variant="default" className="text-[10px] font-bold">Name ★</Badge>
          <span>Responsible Nurse</span>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="secondary" className="text-[10px]">Name</Badge>
          <span>Assigned</span>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="secondary" className="text-[10px]">
            Name <span className="bg-amber-500/20 text-amber-700 rounded px-0.5">S</span>
          </Badge>
          <span>On Call</span>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="secondary" className="text-[10px] opacity-60 border-dashed">Name D</Badge>
          <span>Draft</span>
        </div>
        <div className="flex items-center gap-1">
          <Lock className="h-3 w-3" />
          <span>Blocked Date</span>
        </div>
      </div>

      {/* Shift Detail Panel */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className={shiftTextColors[detailType]}>{shiftLabels[detailType]}</span>
              <span className="text-muted-foreground font-normal text-sm">
                {detailDate && format(new Date(detailDate + "T00:00"), "EEE, MMM d")}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {detailShifts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No staff assigned.</p>
            ) : (
              detailShifts.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{(s as any).profiles?.full_name || "Unknown"}</span>
                    {s.is_responsible_on_shift && <Badge variant="default" className="text-[10px] px-1 py-0">★ Responsible</Badge>}
                    {(s as any).is_standby && <Badge variant="outline" className="text-[10px] px-1 py-0 bg-amber-500/10 text-amber-700">OC On Call</Badge>}
                    {s.is_draft && <Badge variant="outline" className="text-[10px] px-1 py-0 opacity-60">Draft</Badge>}
                  </div>
                  <div className="flex items-center gap-1">
                    {(() => {
                      const profile = staff.find((p) => p.id === s.assigned_user_id);
                      const canBeResponsible = profile?.is_responsible === true;
                      return (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          title={!canBeResponsible ? "Not qualified" : s.is_responsible_on_shift ? "Remove responsible" : "Set as responsible"}
                          disabled={(!canBeResponsible && !s.is_responsible_on_shift) || isDateBlocked(detailDate)}
                          onClick={() => toggleResponsible.mutate({ shiftId: s.id, value: !s.is_responsible_on_shift })}
                        >
                          <Star className={`h-4 w-4 ${s.is_responsible_on_shift ? "fill-primary text-primary" : canBeResponsible ? "text-muted-foreground" : "text-muted-foreground/30"}`} />
                        </Button>
                      );
                    })()}
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                      title="Remove from shift"
                      disabled={isDateBlocked(detailDate)}
                      onClick={() => removeShift.mutate(s.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          {!isDateBlocked(detailDate) && (
            <Button variant="outline" className="w-full mt-2" onClick={() => { setDetailOpen(false); setBulkDate(detailDate); setBulkType(detailType); setBulkOpen(true); }}>
              <Users className="h-4 w-4 mr-2" />
              Add More Staff
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {/* Add/Edit Shift Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) setSaveError(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingShift ? "Edit Shift" : "Add Shift"}</DialogTitle>
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
                <Label>Start</Label>
                <Input type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>End</Label>
                <Input type="time" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>On Call Shift</Label>
              <Switch checked={form.is_standby} onCheckedChange={(v) => setForm((f) => ({ ...f, is_standby: v, assigned_user_id: "" }))} />
            </div>

            <div className="space-y-2">
              <Label>Assign to Staff</Label>
              <Select value={form.assigned_user_id || "__unassigned__"} onValueChange={(v) => setForm((f) => ({ ...f, assigned_user_id: v === "__unassigned__" ? "" : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">Unassigned</SelectItem>
                  {getStaffForDropdown().map((s) => {
                    const userBlocked = blockedDates.some((b) => {
                      if (b.user_id !== s.id) return false;
                      if (b.end_date) return form.date >= b.date && form.date <= b.end_date;
                      return b.date === form.date;
                    });
                    return (
                      <SelectItem key={s.id} value={s.id} disabled={userBlocked}>
                        {s.full_name} {userBlocked ? "🚫 Blocked" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {form.is_standby && <p className="text-xs text-muted-foreground">Only managers and responsible nurses shown for on call shifts.</p>}
            </div>

            <div className="space-y-2">
              <Label>Manager on Duty</Label>
              <Select value={form.manager_on_duty_id || "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, manager_on_duty_id: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {managerStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label>Responsible on Shift</Label>
              <Switch checked={form.is_responsible_on_shift} onCheckedChange={(v) => setForm((f) => ({ ...f, is_responsible_on_shift: v }))} />
            </div>

            <div className="flex items-center justify-between">
              <Label>Draft</Label>
              <Switch checked={form.is_draft} onCheckedChange={(v) => setForm((f) => ({ ...f, is_draft: v }))} />
            </div>

            <div className="space-y-2">
              <Label>Comments</Label>
              <Textarea value={form.comments} onChange={(e) => setForm((f) => ({ ...f, comments: e.target.value }))} />
            </div>

            {saveError && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{saveError}</span>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              {editingShift && (
                <Button variant="destructive" size="sm" onClick={() => { removeShift.mutate(editingShift); setDialogOpen(false); setEditingShift(null); }}>
                  <Trash2 className="mr-1 h-4 w-4" />
                  Delete
                </Button>
              )}
              <Button className="flex-1" onClick={handleSaveWithFriction} disabled={saveShift.isPending}>
                {editingShift ? "Update" : "Create"} Shift
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <BulkAssignDialog open={bulkOpen} onOpenChange={setBulkOpen} staff={staff} blockedDates={blockedDates} initialDate={bulkDate} initialType={bulkType} />
      <FrictionDialog
        open={frictionOpen}
        onOpenChange={setFrictionOpen}
        warnings={frictionWarnings}
        onConfirm={() => { setFrictionOpen(false); saveShift.mutate(); }}
        isPending={saveShift.isPending}
      />
    </div>
  );
}
