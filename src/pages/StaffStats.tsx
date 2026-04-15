import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Sun, Sunset, Moon, TrendingUp, ArrowLeftRight, CalendarOff,
  Calendar, Users, Star, ChevronLeft, ChevronRight, UserPlus,
  Lock, CheckCircle, AlertTriangle, Check, X, ClipboardCheck,
} from "lucide-react";
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addWeeks, subWeeks, addMonths, subMonths, addDays,
  differenceInCalendarDays, getDay, isBefore, startOfDay,
} from "date-fns";
import { toast } from "sonner";
import { useTranslation } from "@/i18n/useTranslation";
import { formatLocale } from "@/i18n/dateLocale";
import { VerifyShiftDialog } from "@/components/staff/VerifyShiftDialog";

const SHIFT_TYPES = ["morning", "evening", "night"] as const;

const SHIFT_ICON: Record<string, React.ReactNode> = {
  morning: <Sun className="h-4 w-4 text-shift-morning" />,
  evening: <Sunset className="h-4 w-4 text-shift-evening" />,
  night: <Moon className="h-4 w-4 text-shift-night" />,
};

const SHIFT_BORDER: Record<string, string> = {
  morning: "border-s-2 border-s-shift-morning",
  evening: "border-s-2 border-s-shift-evening",
  night: "border-s-2 border-s-shift-night",
};

const SHIFT_BG: Record<string, string> = {
  morning: "bg-shift-morning/10",
  evening: "bg-shift-evening/10",
  night: "bg-shift-night/10",
};

function parseHoursFromTime(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60; // overnight
  return diff / 60;
}

export default function StaffStats() {
  const { user } = useAuth();
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string>("");
  const [mode, setMode] = useState<"weekly" | "monthly">("weekly");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);

  // Verify dialog
  const [verifyShift, setVerifyShift] = useState<any>(null);
  const [reauditConfirm, setReauditConfirm] = useState<any>(null);

  // Proxy request dialog state
  const [proxyOpen, setProxyOpen] = useState(false);
  const [proxyType, setProxyType] = useState<"block" | "vacation">("block");
  const [proxyDate, setProxyDate] = useState("");
  const [proxyEndDate, setProxyEndDate] = useState("");
  const [proxyReason, setProxyReason] = useState("");
  const [proxyBlockedShifts, setProxyBlockedShifts] = useState<string[]>([]);

  useEffect(() => {
    const idFromUrl = searchParams.get("id");
    if (idFromUrl && !selectedId) setSelectedId(idFromUrl);
  }, [searchParams, selectedId]);

  const now = new Date();
  const today = startOfDay(now);

  const baseWeek = addWeeks(startOfWeek(now, { weekStartsOn: 0 }), weekOffset);
  const weekStart = baseWeek;
  const weekEnd = endOfWeek(baseWeek, { weekStartsOn: 0 });
  const baseMonth = addMonths(now, monthOffset);
  const monthStart = startOfMonth(baseMonth);
  const monthEnd = endOfMonth(baseMonth);
  const rangeStart = mode === "weekly" ? weekStart : monthStart;
  const rangeEnd = mode === "weekly" ? weekEnd : monthEnd;

  const { data: staff = [] } = useQuery({
    queryKey: ["staff-stats-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, target_fte_percent, is_responsible, constraints, is_active")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: staffRoles = [] } = useQuery({
    queryKey: ["staff-stats-roles", selectedId],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", selectedId);
      return data?.map((r) => r.role) ?? [];
    },
    enabled: !!selectedId,
  });

  const selectedProfile = staff.find((s) => s.id === selectedId);

  const { data: rangeShifts = [] } = useQuery({
    queryKey: ["staff-stats-range", selectedId, format(rangeStart, "yyyy-MM-dd"), format(rangeEnd, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .eq("assigned_user_id", selectedId)
        .gte("date", format(rangeStart, "yyyy-MM-dd"))
        .lte("date", format(rangeEnd, "yyyy-MM-dd"))
        .order("date");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedId,
  });

  const { data: swapRequests = [] } = useQuery({
    queryKey: ["staff-stats-swaps", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("swap_requests")
        .select("*, shift:shifts(date, type, start_time, end_time), covering_profile:profiles!swap_requests_covering_user_id_fkey(full_name)")
        .or(`requesting_user_id.eq.${selectedId},covering_user_id.eq.${selectedId}`)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedId,
  });

  const { data: availRequests = [] } = useQuery({
    queryKey: ["staff-stats-avail", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_requests")
        .select("*")
        .eq("user_id", selectedId)
        .order("date", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedId,
  });

  // Approve/decline availability mutation
  const updateAvailStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "declined" }) => {
      const { error } = await supabase
        .from("availability_requests")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["staff-stats-avail"] });
      toast.success(`Request ${vars.status}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Proxy request mutation
  const createProxyRequest = useMutation({
    mutationFn: async () => {
      if (!selectedId || !proxyDate || !user) return;
      const isBlock = proxyType === "block";
      const endStr = isBlock ? proxyDate : (proxyEndDate || proxyDate);
      const { error } = await supabase.from("availability_requests").insert({
        user_id: selectedId,
        date: proxyDate,
        end_date: endStr,
        reason: proxyReason || null,
        request_type: proxyType,
        status: "approved",
        blocked_shifts: isBlock ? proxyBlockedShifts : [],
        created_by_manager_id: user.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-stats-avail"] });
      toast.success("Request created on behalf of staff");
      closeProxyDialog();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const closeProxyDialog = () => {
    setProxyOpen(false);
    setProxyType("block");
    setProxyDate("");
    setProxyEndDate("");
    setProxyReason("");
    setProxyBlockedShifts([]);
  };

  const toggleProxyShift = (shift: string) => {
    setProxyBlockedShifts((prev) =>
      prev.includes(shift) ? prev.filter((s) => s !== shift) : [...prev, shift]
    );
  };

  const fte = selectedProfile?.target_fte_percent ?? 1;
  let expectedShifts: number;
  if (mode === "weekly") {
    expectedShifts = 5 * fte;
  } else {
    let workingDays = 0;
    const totalDays = differenceInCalendarDays(monthEnd, monthStart) + 1;
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(monthStart, i);
      const dow = getDay(d);
      if (dow !== 0 && dow !== 6) workingDays++;
    }
    expectedShifts = Math.round(workingDays * fte);
  }
  const fulfillment = expectedShifts > 0 ? Math.round((rangeShifts.length / expectedShifts) * 100) : 0;

  const morningCount = rangeShifts.filter((s) => s.type === "morning").length;
  const eveningCount = rangeShifts.filter((s) => s.type === "evening").length;
  const nightCount = rangeShifts.filter((s) => s.type === "night").length;

  // Calculate total hours using actuals when verified
  const totalHours = rangeShifts.reduce((sum, s) => {
    const raw = s as any;
    if (raw.is_verified && raw.actual_start_time && raw.actual_end_time) {
      return sum + parseHoursFromTime(raw.actual_start_time, raw.actual_end_time);
    }
    return sum + parseHoursFromTime(s.start_time, s.end_time);
  }, 0);

  const verifiedCount = rangeShifts.filter((s) => (s as any).is_verified).length;
  const pastUnverified = rangeShifts.filter((s) => isBefore(new Date(s.date), today) && !(s as any).is_verified);

  const shiftLabel: Record<string, string> = { morning: t("shift.morning"), evening: t("shift.evening"), night: t("shift.night") };
  const statusColor: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
    peer_accepted: "bg-blue-100 text-blue-800 border-blue-200",
    manager_approved: "bg-green-100 text-green-800 border-green-200",
    denied: "bg-red-100 text-red-800 border-red-200",
    approved: "bg-green-100 text-green-800 border-green-200",
    declined: "bg-red-100 text-red-800 border-red-200",
  };

  const handlePrev = () => mode === "weekly" ? setWeekOffset((o) => o - 1) : setMonthOffset((o) => o - 1);
  const handleNext = () => mode === "weekly" ? setWeekOffset((o) => o + 1) : setMonthOffset((o) => o + 1);
  const handleToday = () => { setWeekOffset(0); setMonthOffset(0); };

  const rangeLabel = mode === "weekly"
    ? `${formatLocale(weekStart, "MMM d", locale)} — ${formatLocale(weekEnd, "MMM d, yyyy", locale)}`
    : formatLocale(baseMonth, "MMMM yyyy", locale);

  const formatBlockedShifts = (req: any) => {
    const shifts: string[] = req.blocked_shifts || [];
    if (shifts.length === 0) return null;
    return shifts.map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join(" & ");
  };

  // Group shifts by date for day-by-day view
  const shiftsByDate = rangeShifts.reduce<Record<string, any[]>>((acc, s) => {
    (acc[s.date] = acc[s.date] || []).push(s);
    return acc;
  }, {});

  const pendingAvail = availRequests.filter((ar) => ar.status === "pending");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">{t("staffStats.title")}</h1>
        <Tabs value={mode} onValueChange={(v) => setMode(v as "weekly" | "monthly")}>
          <TabsList>
            <TabsTrigger value="weekly">{t("staffStats.weekly")}</TabsTrigger>
            <TabsTrigger value="monthly">{t("staffStats.monthly")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Staff selector */}
      <Select value={selectedId} onValueChange={setSelectedId}>
        <SelectTrigger className="w-full sm:w-80">
          <SelectValue placeholder={t("staffStats.selectMember")} />
        </SelectTrigger>
        <SelectContent>
          {staff.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.full_name || "Unnamed"}
              {s.is_responsible && " ★"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!selectedId && (
        <div className="flex flex-col items-center py-12 text-muted-foreground">
          <Users className="h-10 w-10 mb-2 opacity-40" />
          <p className="text-sm">{t("staffStats.selectPrompt")}</p>
        </div>
      )}

      {selectedId && selectedProfile && (
        <>
          {/* Profile summary */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-lg font-semibold">{selectedProfile.full_name}</span>
                {staffRoles.map((r) => (
                  <Badge key={r} variant="outline" className="capitalize">{r}</Badge>
                ))}
                <span className="text-sm text-muted-foreground">{(fte * 100).toFixed(0)}% FTE</span>
                {selectedProfile.is_responsible && (
                  <Badge className="gap-1"><Star className="h-3 w-3 fill-current" /> Resp. Nurse</Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Period navigation */}
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrev}><ChevronLeft className="h-4 w-4 rtl:rotate-180" /></Button>
            <Button variant="outline" size="sm" onClick={handleToday}>
              {mode === "weekly" ? t("calendar.thisWeek") : t("calendar.thisMonth")}
            </Button>
            <span className="text-sm font-medium min-w-[180px] text-center">{rangeLabel}</span>
            <Button variant="outline" size="icon" onClick={handleNext}><ChevronRight className="h-4 w-4 rtl:rotate-180" /></Button>
          </div>

          {/* ===== PRIMARY: Fulfillment ===== */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4" />
                {mode === "weekly" ? t("stats.weeklyFulfillment") : t("stats.monthlyFulfillment")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{rangeShifts.length} {t("stats.of")} {expectedShifts} {t("stats.shifts")}</span>
                  <span className="font-semibold">{fulfillment}%</span>
                </div>
                <Progress value={Math.min(fulfillment, 100)} className="h-3" />
              </div>
              {/* Total hours */}
              <div className="mt-3 flex items-center gap-3 text-sm">
                <span className="font-medium">{totalHours.toFixed(1)}h {t("staffStats.totalHours")}</span>
                {verifiedCount > 0 && (
                  <Badge variant="outline" className="gap-1 text-xs">
                    <CheckCircle className="h-3 w-3 text-green-600" />
                    {verifiedCount} {t("staffStats.verified")}
                  </Badge>
                )}
                {pastUnverified.length > 0 && (
                  <Badge variant="outline" className="gap-1 text-xs text-amber-600 border-amber-200">
                    <AlertTriangle className="h-3 w-3" />
                    {pastUnverified.length} {t("staffStats.unverified")}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ===== SECONDARY: Shift Type Breakdown ===== */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-shift-morning/15">
                  <Sun className="h-5 w-5 text-shift-morning" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{morningCount}</p>
                  <p className="text-xs text-muted-foreground">{t("shift.morning")}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-shift-evening/15">
                  <Sunset className="h-5 w-5 text-shift-evening" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{eveningCount}</p>
                  <p className="text-xs text-muted-foreground">{t("shift.evening")}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-shift-night/15">
                  <Moon className="h-5 w-5 text-shift-night" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{nightCount}</p>
                  <p className="text-xs text-muted-foreground">{t("shift.night")}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ===== TERTIARY: Day-by-Day Shift List with Audit ===== */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardCheck className="h-4 w-4" /> {t("staffStats.dayByDay")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(shiftsByDate).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("staffStats.noShiftsPeriod")}</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(shiftsByDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, shifts]) => (
                    <div key={date}>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        {formatLocale(new Date(date), "EEE, MMM d", locale)}
                      </p>
                      <div className="space-y-1">
                        {shifts.map((s: any) => {
                          const isPast = isBefore(new Date(s.date), today);
                          const isVerified = s.is_verified;
                          const hours = isVerified && s.actual_start_time && s.actual_end_time
                            ? parseHoursFromTime(s.actual_start_time, s.actual_end_time)
                            : parseHoursFromTime(s.start_time, s.end_time);
                          return (
                            <div
                              key={s.id}
                              className={`flex items-center justify-between rounded-sm p-3 ${SHIFT_BORDER[s.type]} ${SHIFT_BG[s.type]} ${
                                s.is_draft ? "border-dashed opacity-70" : ""
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                {SHIFT_ICON[s.type]}
                                <span className="text-sm font-medium capitalize">{shiftLabel[s.type]}</span>
                                <span className="text-sm text-muted-foreground">
                                  {isVerified && s.actual_start_time && s.actual_end_time
                                    ? `${s.actual_start_time} — ${s.actual_end_time}`
                                    : `${s.start_time?.slice(0, 5)} — ${s.end_time?.slice(0, 5)}`
                                  }
                                </span>
                                <span className="text-xs text-muted-foreground">({hours.toFixed(1)}h)</span>
                                {s.is_responsible_on_shift && <Star className="h-3 w-3 text-shift-morning fill-shift-morning" />}
                              </div>
                              <div className="flex items-center gap-1">
                                {isVerified && (
                                   <Badge variant="outline" className="gap-1 text-xs text-green-700 border-green-200">
                                    <Lock className="h-3 w-3" /> {t("roster.verified")}
                                  </Badge>
                                  </Badge>
                                )}
                                {isPast ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs gap-1"
                                    onClick={() => {
                                      if (isVerified) {
                                        setReauditConfirm(s);
                                      } else {
                                        setVerifyShift(s);
                                      }
                                    }}
                                  >
                                    <ClipboardCheck className="h-3 w-3" /> {isVerified ? t("roster.reaudit") : t("roster.audit")}
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">{t("common.upcoming")}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ===== Pending Availability Requests (Quick Actions) ===== */}
          {pendingAvail.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarOff className="h-4 w-4" /> {t("staffStats.pendingAvail")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {pendingAvail.map((ar) => {
                    const blockedLabel = formatBlockedShifts(ar);
                    return (
                      <div key={ar.id} className="flex items-center justify-between rounded-sm border p-3">
                        <div className="text-sm">
                           <span className="font-medium">{formatLocale(new Date(ar.date), "MMM d", locale)}</span>
                          {ar.end_date && ar.end_date !== ar.date && (
                             <span className="text-muted-foreground"> — {formatLocale(new Date(ar.end_date), "MMM d", locale)}</span>
                          )}
                          <Badge variant="outline" className="ms-2 capitalize text-xs">{ar.request_type}</Badge>
                          {blockedLabel && (
                             <span className="ms-2 text-xs text-muted-foreground">({blockedLabel} {t("common.only")})</span>
                          )}
                          {ar.reason && <span className="ms-2 text-xs text-muted-foreground italic">{ar.reason}</span>}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => updateAvailStatus.mutate({ id: ar.id, status: "approved" })}
                            disabled={updateAvailStatus.isPending}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-red-50"
                            onClick={() => updateAvailStatus.mutate({ id: ar.id, status: "declined" })}
                            disabled={updateAvailStatus.isPending}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Swap requests */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowLeftRight className="h-4 w-4" /> {t("staffStats.swapRequests")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {swapRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("staffStats.noSwapRequests")}</p>
              ) : (
                <div className="space-y-2">
                  {swapRequests.map((sr) => {
                    const shift = sr.shift as any;
                    const coveringProfile = sr.covering_profile as any;
                    return (
                      <div key={sr.id} className="flex items-center justify-between rounded-sm border p-3">
                        <div className="text-sm">
                          <span className="font-medium">
                            {shift?.date ? formatLocale(new Date(shift.date), "MMM d", locale) : "—"}
                          </span>
                          {shift && (
                            <span className="ms-2 text-muted-foreground capitalize">
                              {shiftLabel[shift.type] || shift.type} {shift.start_time?.slice(0, 5)}–{shift.end_time?.slice(0, 5)}
                            </span>
                          )}
                          {!sr.is_pool_request && coveringProfile?.full_name && (
                            <span className="ms-2 text-muted-foreground">{t("common.with")} {coveringProfile.full_name}</span>
                          )}
                          {sr.is_pool_request && (
                            <span className="ms-2 text-muted-foreground italic">{t("common.pool")}</span>
                          )}
                        </div>
                         <Badge variant="outline" className={statusColor[sr.status] || ""}>
                          {t(`status.${sr.status}`)}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* All Availability Requests */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarOff className="h-4 w-4" /> {t("staffStats.availRequests")}
                </CardTitle>
                 <Button size="sm" variant="outline" onClick={() => setProxyOpen(true)}>
                  <UserPlus className="me-1 h-4 w-4" />
                  {t("staffStats.requestOnBehalf")}
                </Button>
                  Request on Behalf
                </Button>
              </div>
            </CardHeader>
            <CardContent>
               {availRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("staffStats.noAvailRequests")}</p>
              ) : (
                <div className="space-y-2">
                  {availRequests.map((ar) => {
                    const blockedLabel = formatBlockedShifts(ar);
                    return (
                      <div key={ar.id} className="flex items-center justify-between rounded-sm border p-3">
                        <div className="text-sm">
                          <span className="font-medium">{formatLocale(new Date(ar.date), "MMM d", locale)}</span>
                          {ar.end_date && ar.end_date !== ar.date && (
                            <span className="text-muted-foreground"> — {format(new Date(ar.end_date), "MMM d")}</span>
                          )}
                           <Badge variant="outline" className="ms-2 capitalize text-xs">{ar.request_type === "vacation" ? t("common.vacation") : t("common.block")}</Badge>
                          {blockedLabel && (
                            <span className="ms-2 text-xs text-muted-foreground">({blockedLabel} {t("common.only")})</span>
                          )}
                          {(ar as any).created_by_manager_id && (
                            <Badge variant="outline" className="ms-2 text-[10px]">Manager</Badge>
                          )}
                        </div>
                         <Badge variant="outline" className={statusColor[ar.status] || ""}>
                          {t(`status.${ar.status}`)}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Proxy request dialog */}
      <Dialog open={proxyOpen} onOpenChange={(open) => { if (!open) closeProxyDialog(); else setProxyOpen(true); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("staffStats.requestOnBehalfOf")} {selectedProfile?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("common.type")}</Label>
              <Select value={proxyType} onValueChange={(v: any) => { setProxyType(v); setProxyBlockedShifts([]); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                   <SelectItem value="block">
                    <span className="flex items-center gap-2"><CalendarOff className="h-3 w-3" /> {t("avail.blockDates")}</span>
                  </SelectItem>
                  <SelectItem value="vacation">
                    <span className="flex items-center gap-2">🌴 {t("avail.vacationLabel")}</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {proxyType === "block" ? (
              <>
                <div className="space-y-2">
                  <Label>{t("common.date")}</Label>
                  <Input type="date" value={proxyDate} onChange={(e) => setProxyDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                   <Label>{t("avail.blockShifts")}</Label>
                  <p className="text-xs text-muted-foreground">{t("avail.blockShiftsHint")}</p>
                  <div className="flex gap-3">
                    {SHIFT_TYPES.map((type) => (
                      <label key={type} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={proxyBlockedShifts.includes(type)} onCheckedChange={() => toggleProxyShift(type)} />
                        <span className="capitalize">{t(`shift.${type}`)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t("avail.startDate")}</Label>
                  <Input type="date" value={proxyDate} onChange={(e) => setProxyDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("avail.endDate")}</Label>
                  <Input type="date" value={proxyEndDate || proxyDate} min={proxyDate} onChange={(e) => setProxyEndDate(e.target.value)} />
                </div>
              </div>
            )}
            <div className="space-y-2">
               <Label>{t("avail.reasonOptional")}</Label>
              <Input placeholder={t("avail.reasonPlaceholder")} value={proxyReason} onChange={(e) => setProxyReason(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
               <Button variant="outline" onClick={closeProxyDialog}>{t("common.cancel")}</Button>
              <Button onClick={() => createProxyRequest.mutate()} disabled={!proxyDate || createProxyRequest.isPending}>
                {t("common.submit")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Verify shift dialog */}
      <VerifyShiftDialog
        open={!!verifyShift}
        onOpenChange={(open) => { if (!open) setVerifyShift(null); }}
        shift={verifyShift}
      />

      {/* Re-audit confirmation */}
      <AlertDialog open={!!reauditConfirm} onOpenChange={(open) => { if (!open) setReauditConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
               <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {t("staffStats.shiftAlreadyFinalized")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("staffStats.shiftAlreadyFinalizedDesc")}
            </AlertDialogDescription>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setVerifyShift(reauditConfirm); setReauditConfirm(null); }}>
              {t("common.continue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
