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
import { formatLocale } from "@/i18n/dateLocale";
import { useTranslation } from "@/i18n/useTranslation";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Users, Star, Trash2, Eye, Lock, ShieldAlert, AlertTriangle, Sun, Sunset, Moon, Phone, Ban, ArrowLeftRight, FileDown } from "lucide-react";
import { exportCalendarToPdf } from "@/lib/exportCalendarPdf";
import { BulkAssignDialog } from "@/components/roster/BulkAssignDialog";
import { FrictionDialog, type FrictionWarning } from "@/components/roster/FrictionDialog";
import { validateShiftFriction, isOverHeadcount, getHeadcountTarget } from "@/components/roster/frictionValidation";
import { compareStaff, compareShiftAssignment, isAssistant, formatDisplayName } from "@/components/roster/staffSort";
import { useStaffPool } from "@/hooks/useStaffPool";
import { useAppSettings } from "@/hooks/useAppSettings";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { useHolidayMap } from "@/hooks/useHolidays";
import { HolidayCornerIcon } from "@/components/holidays/HolidayCell";

type ShiftType = Database["public"]["Enums"]["shift_type"];

const shiftTypes = ["morning", "evening", "night"] as const;

// shiftLabels moved inside component to use t()

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
  is_external: boolean;
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
  is_external: false,
});

export default function ManagementCalendar() {
  const { t, locale } = useTranslation();
  const { headcountLimits } = useAppSettings();
  const holidayMap = useHolidayMap();
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 0 }));
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const [isExporting, setIsExporting] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  const shiftLabels: Record<string, string> = {
    morning: t("shift.morning"), evening: t("shift.evening"), night: t("shift.night"),
  };

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

  const { data: staffPool = [] } = useStaffPool();
  const staff = staffPool
    .filter((s) => s.is_active || s.kind === "pending")
    .slice()
    .sort(compareStaff);
  // role map: assigned_user_id → role (used to exclude assistants from headcount)
  const staffRoleMap = new Map<string, string>(
    staffPool.map((s) => [s.id, (s.role || s.app_role || "nurse") as string]),
  );

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
        .select("user_id, date, end_date, request_type")
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

  const getBlockTypeForUser = (userId: string, dateStr: string): string | null => {
    const match = blockedDates.find((b: any) => {
      if (b.user_id !== userId) return false;
      if (b.end_date) return dateStr >= b.date && dateStr <= b.end_date;
      return b.date === dateStr;
    });
    return ((match as any)?.request_type as string | undefined) ?? null;
  };

  const blockTypeLabel = (bt: string | null): string => {
    switch (bt) {
      case "vacation": return t("common.vacation");
      case "leave": return t("common.leave");
      case "sick_leave": return t("common.sickLeave");
      case "maternity_leave": return t("common.maternityLeave");
      case "yearly_leave": return t("common.yearlyLeave");
      default: return t("roster.blocked");
    }
  };

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
      is_external: (shift as any).is_external ?? false,
    });
    setDialogOpen(true);
  };

  const getFirstName = (shift: any): string =>
    formatDisplayName(shift.profiles?.full_name);

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

  const detailShifts = shifts
    .filter((s) => s.date === detailDate && s.type === detailType && s.assigned_user_id)
    .slice()
    .sort((a, b) => {
      const pa = staff.find((p) => p.id === a.assigned_user_id);
      const pb = staff.find((p) => p.id === b.assigned_user_id);
      return compareStaff(
        { full_name: (a as any).profiles?.full_name || pa?.full_name || "", is_responsible_on_shift: a.is_responsible_on_shift, is_responsible: pa?.is_responsible, role: pa?.role ?? pa?.app_role },
        { full_name: (b as any).profiles?.full_name || pb?.full_name || "", is_responsible_on_shift: b.is_responsible_on_shift, is_responsible: pb?.is_responsible, role: pb?.role ?? pb?.app_role },
      );
    });
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
  const handleSaveWithFriction = async () => {
    if (!form.assigned_user_id) {
      saveShift.mutate();
      return;
    }
    const weekShiftsForUser = shifts.filter(
      (s) => s.assigned_user_id === form.assigned_user_id && (editingShift ? s.id !== editingShift : true)
    ).length;

    // Fetch user's neighboring shifts (±1 day) for back-to-back rest validation
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

  const handleExportPdf = async () => {
    if (!calendarRef.current) return;
    setIsExporting(true);
    try {
      const titleStr = `${formatLocale(weekStart, "MMM d", locale)} — ${formatLocale(weekEnd, "MMM d, yyyy", locale)}`;
      await exportCalendarToPdf({
        element: calendarRef.current,
        fileName: `weekly-overview-${format(weekStart, "yyyy-MM-dd")}`,
        title: `${t("nav.weeklyOverview") || "Weekly Overview"} — ${titleStr}`,
        orientation: "landscape",
        format: "a4",
        direction: locale === "he" ? "rtl" : "ltr",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-2 flex flex-col min-h-[calc(100vh-5rem)]">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold">Management Calendar</h1>
        <div className="flex gap-1.5 md:gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={isExporting}>
            <FileDown className="h-4 w-4 md:mr-2" />
            <span className="hidden sm:inline">{t("common.exportPdf") || "Export PDF"}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setBulkDate(undefined); setBulkType(undefined); setBulkOpen(true); }}>
            <Users className="h-4 w-4 md:mr-2" />
            <span className="hidden sm:inline">Bulk Assign</span>
          </Button>
          <Button size="sm" onClick={() => openAddShift()}>
            <Plus className="h-4 w-4 md:mr-2" />
            <span className="hidden sm:inline">Add Shift</span>
          </Button>
        </div>
      </div>

      <Card ref={calendarRef} className="flex-1 flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between py-2 px-4">
          <Button variant="ghost" size="icon" onClick={() => setWeekStart(subWeeks(weekStart, 1))} title={locale === "he" ? "שבוע קודם" : "Previous week"}>
            {locale === "he" ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
          <CardTitle className="text-base">
            {formatLocale(weekStart, "MMM d", locale)} — {formatLocale(weekEnd, "MMM d, yyyy", locale)}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))} title={locale === "he" ? "שבוע הבא" : "Next week"}>
            {locale === "he" ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent className="overflow-hidden p-0 flex-1 flex flex-col">
          <div className="relative isolate overflow-x-auto flex-1 flex flex-col">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[50px] bg-card shadow-[2px_0_8px_-4px_hsl(var(--foreground)/0.18)] md:w-[90px]"
            />
            <table className="w-full border-separate border-spacing-0 text-xs md:text-sm table-fixed flex-1 h-full">
              <colgroup>
                <col className="w-[50px] md:w-[90px]" />
                {days.map((d) => (
                  <col key={d.toISOString()} style={{ width: `calc((100% - 90px) / 7)` }} />
                ))}
              </colgroup>
            <thead>
              <tr>
                <th className="sticky left-0 z-30 w-[50px] min-w-[50px] border-b border-r bg-card p-1.5 text-left font-medium text-muted-foreground shadow-[2px_0_8px_-4px_hsl(var(--foreground)/0.18)] md:w-[90px] md:min-w-[90px] md:p-2">
                  <span className="hidden md:inline">{t("roster.shift")}</span>
                  <span className="md:hidden">{t("roster.type")}</span>
                </th>
                {days.map((d) => {
                  const dateStr = format(d, "yyyy-MM-dd");
                  const blocked = isDateBlocked(dateStr);
                  const holiday = holidayMap.get(dateStr);
                  return (
                    <th key={d.toISOString()} className={`relative z-10 border-b p-1.5 text-center font-medium text-muted-foreground md:p-2 ${blocked ? "bg-muted/50" : ""}`}>
                      <div
                        className={`flex items-center justify-center gap-1.5 px-1 py-0.5 rounded-sm ${holiday && !holiday.is_eve ? "bg-[hsl(0_75%_88%)]" : ""}`}
                        style={holiday?.is_eve ? { backgroundImage: "repeating-linear-gradient(45deg, hsl(0 75% 82%) 0 6px, transparent 6px 14px)" } : undefined}
                      >
                        <HolidayCornerIcon holiday={holiday} inline />
                        <span className={holiday ? "text-destructive font-semibold" : ""}>{formatLocale(d, "EEE", locale)}</span>
                        {blocked && <Lock className="h-3 w-3 text-muted-foreground" />}
                      </div>
                      <div className={`text-[10px] md:text-xs ${holiday ? "text-destructive/80" : ""}`}>{formatLocale(d, "MMM d", locale)}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {shiftTypes.map((type) => {
                const Icon = type === "morning" ? Eye : type === "evening" ? Star : Lock;
                return (
                <tr key={type} className="border-t" style={{ height: `${100 / 3}%` }}>
                  <td className={`sticky left-0 z-20 w-[50px] min-w-[50px] overflow-hidden border-r bg-card p-1.5 font-semibold shadow-[2px_0_8px_-4px_hsl(var(--foreground)/0.18)] md:w-[90px] md:min-w-[90px] md:p-2 ${shiftTextColors[type]}`}>
                    <span className="hidden md:inline">{shiftLabels[type]}</span>
                    <span className="md:hidden flex items-center gap-0.5">
                      {type === "morning" && <Sun className="h-3.5 w-3.5" />}
                      {type === "evening" && <Sunset className="h-3.5 w-3.5" />}
                      {type === "night" && <Moon className="h-3.5 w-3.5" />}
                      <span>{type.charAt(0).toUpperCase()}</span>
                    </span>
                  </td>
                  {days.map((d) => {
                    const dateStr = format(d, "yyyy-MM-dd");
                    const blocked = isDateBlocked(dateStr);
                    const dayShifts = shifts
                      .filter((s) => s.date === dateStr && s.type === type && s.assigned_user_id)
                      .slice()
                      .sort((a, b) => {
                        const pa = staff.find((p) => p.id === a.assigned_user_id);
                        const pb = staff.find((p) => p.id === b.assigned_user_id);
                        return compareShiftAssignment(
                           {
                             full_name: (a as any).profiles?.full_name || pa?.full_name || "",
                             is_responsible_on_shift: a.is_responsible_on_shift,
                             is_responsible: pa?.is_responsible,
                             role: pa?.role ?? pa?.app_role,
                             is_standby: (a as any).is_standby,
                           },
                           {
                             full_name: (b as any).profiles?.full_name || pb?.full_name || "",
                             is_responsible_on_shift: b.is_responsible_on_shift,
                             is_responsible: pb?.is_responsible,
                             role: pb?.role ?? pb?.app_role,
                             is_standby: (b as any).is_standby,
                           },
                         );
                      });
                    const overHeadcount = isOverHeadcount(shifts as any[], dateStr, type, headcountLimits, staffRoleMap);
                    return (
                      <td
                        key={d.toISOString()}
                        className={`relative z-0 border-l p-2 align-top h-full ${blocked ? "cursor-not-allowed bg-muted/50" : `${shiftColors[type]} cursor-pointer hover:opacity-80`} ${overHeadcount ? "bg-red-50/50 border border-red-200" : ""}`}
                        onClick={() => !blocked && handleCellClick(dateStr, type)}
                      >
                        {overHeadcount && (
                          <div className="absolute top-1 right-1 flex items-center gap-0.5">
                            <span className="text-[9px] text-red-500 font-medium leading-none">{dayShifts.filter(s => !(s as any).is_standby && !(s as any).is_external && (() => { const r = staffRoleMap.get(s.assigned_user_id || ""); return r !== "assistant"; })()).length}/{getHeadcountTarget(type, dateStr, headcountLimits)}</span>
                            <AlertTriangle className="h-3 w-3 text-red-400" />
                          </div>
                        )}
                        {dayShifts.length === 0 ? (
                          <span className="text-xs text-muted-foreground italic">{blocked ? "🔒" : "—"}</span>
                        ) : (
                          <div className={`calendar-staff-list flex flex-col gap-1 ${overHeadcount ? "mt-4" : ""}`}>
                            {dayShifts.map((s) => {
                              const profile = staff.find((p) => p.id === s.assigned_user_id);
                              const assistantRole = isAssistant(profile?.role ?? profile?.app_role);
                              const isExternal = (s as any).is_external;
                              const isStandby = (s as any).is_standby;
                              return (
                              <Badge
                                key={s.id}
                                variant={s.is_responsible_on_shift ? "default" : "secondary"}
                                className={`calendar-staff-badge flex w-full min-w-0 items-center gap-0.5 overflow-hidden whitespace-nowrap text-[11px] px-1.5 py-0 leading-tight shadow-none ${s.is_responsible_on_shift ? "font-bold" : "font-normal"} ${
                                  isExternal
                                    ? "bg-slate-50 border-slate-200 text-slate-400 opacity-80"
                                    : isStandby
                                    ? "bg-blue-50/60 border-l-4 border-blue-400 border-t-0 border-r-0 border-b-0 rounded-sm text-foreground"
                                    : s.is_draft ? "opacity-60 border-dashed" : "ring-1 ring-current/20"
                                } ${assistantRole && !s.is_responsible_on_shift && !isExternal && !isStandby ? "bg-gray-100/50 text-muted-foreground border-muted-foreground/20" : ""}`}
                              >
                                {isExternal && <ArrowLeftRight className="h-2.5 w-2.5 shrink-0" />}
                                <span className="calendar-staff-name min-w-0 flex-1 truncate">{getFirstName(s)}</span>
                                {s.is_responsible_on_shift && <Star className="h-2.5 w-2.5 shrink-0 fill-current" />}
                                {isStandby && <Phone className="h-2.5 w-2.5 shrink-0" />}
                              </Badge>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <div className="flex items-center gap-1.5">
          <Star className="h-3.5 w-3.5 fill-current text-foreground" />
          <span>{t("roster.responsibleNurse")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5 text-blue-500" />
          <span>{t("calendar.onCall")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <ArrowLeftRight className="h-3.5 w-3.5" />
          <span>{t("common.external") || "Out of ward"}</span>
        </div>
      </div>

      {/* Shift Detail Panel */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className={shiftTextColors[detailType]}>{shiftLabels[detailType]}</span>
              <span className="text-muted-foreground font-normal text-sm">
                {detailDate && formatLocale(new Date(detailDate + "T00:00"), "EEE, MMM d", locale)}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {detailShifts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No staff assigned.</p>
            ) : (
              detailShifts.map((s) => {
                const profile = staff.find((p) => p.id === s.assigned_user_id);
                const assistantRole = isAssistant(profile?.role ?? profile?.app_role);
                return (
                <div key={s.id} className={`flex items-center justify-between rounded-md border px-3 py-2 ${assistantRole ? "bg-muted/50" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${assistantRole ? "text-muted-foreground" : ""}`}>{(s as any).profiles?.full_name || profile?.full_name || "Unknown"}</span>
                    {s.is_responsible_on_shift && <Badge variant="default" className="text-[10px] px-1 py-0 gap-0.5"><Star className="h-2.5 w-2.5 fill-current" /> Responsible</Badge>}
                    {(s as any).is_standby && <Badge variant="outline" className="text-[10px] px-1 py-0 bg-amber-500/10 text-amber-700 gap-0.5"><Phone className="h-2.5 w-2.5" /> On Call</Badge>}
                    {assistantRole && <Badge variant="outline" className="text-[10px] px-1 py-0 bg-muted text-muted-foreground border-muted-foreground/20">Assistant</Badge>}
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
                );
              })
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
              <Label className="flex items-center gap-1.5">
                <ArrowLeftRight className="h-3.5 w-3.5" />
                {locale === "he" ? "מחוץ למחלקה" : "Not at Ward (External)"}
              </Label>
              <Switch checked={form.is_external} onCheckedChange={(v) => setForm((f) => ({ ...f, is_external: v }))} />
            </div>

            <div className="space-y-2">
              <Label>{t("roster.assignToStaff")}</Label>
              <Select value={form.assigned_user_id || "__unassigned__"} onValueChange={(v) => setForm((f) => ({ ...f, assigned_user_id: v === "__unassigned__" ? "" : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">{t("roster.unassigned")}</SelectItem>
                  {getStaffForDropdown().map((s) => {
                    const userBlocked = blockedDates.some((b: any) => {
                      if (b.user_id !== s.id) return false;
                      if (b.end_date) return form.date >= b.date && form.date <= b.end_date;
                      return b.date === form.date;
                    });
                    const blockType = userBlocked ? getBlockTypeForUser(s.id, form.date) : null;
                    const blockLabel = blockTypeLabel(blockType);
                    return (
                      <SelectItem key={s.id} value={s.id} disabled={userBlocked}>
                        <span className="flex items-center gap-1">
                          {userBlocked && <Ban className="h-3 w-3 text-destructive" />}
                          {s.full_name}{(s as any).kind === "pending" ? " (Pending)" : ""}
                          {userBlocked ? ` — ${blockLabel}` : ""}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {form.is_standby && <p className="text-xs text-muted-foreground">{t("roster.onCallHint")}</p>}
            </div>

            <div className="space-y-2">
              <Label>{t("roster.managerOnDuty")}</Label>
              <Select value={form.manager_on_duty_id || "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, manager_on_duty_id: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("roster.none")}</SelectItem>
                  {managerStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  {t("roster.delete")}
                </Button>
              )}
              <Button className="flex-1" onClick={handleSaveWithFriction} disabled={saveShift.isPending}>
                {editingShift ? t("roster.update") : t("roster.create")} {t("roster.shift")}
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
