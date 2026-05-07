import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay,
  addMonths, subMonths, isWithinInterval, parseISO, isToday,
} from "date-fns";
import { useState } from "react";
import { ChevronLeft, ChevronRight, X, CalendarOff, Palmtree, Plane, Bandage, Baby, GraduationCap, Star } from "lucide-react";
import { useTranslation } from "@/i18n/useTranslation";
import { formatLocale } from "@/i18n/dateLocale";
import { isLeaveType, isPreferenceType } from "@/lib/availabilityTypes";

const SHIFT_TYPES = ["morning", "evening", "night"] as const;

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  declined: "bg-red-100 text-red-800 border-red-200",
};

const typeIcons: Record<string, React.ReactNode> = {
  block: <CalendarOff className="h-3 w-3 shrink-0" />,
  vacation: <Palmtree className="h-3 w-3 shrink-0" />,
  leave: <Plane className="h-3 w-3 shrink-0" />, // legacy
  sick_leave: <Bandage className="h-3 w-3 shrink-0" />,
  maternity_leave: <Baby className="h-3 w-3 shrink-0" />,
  yearly_leave: <Palmtree className="h-3 w-3 shrink-0" />,
  study: <GraduationCap className="h-3 w-3 shrink-0" />,
  preference: <Star className="h-3 w-3 shrink-0" />,
};

type AvailType = "block" | "vacation" | "sick_leave" | "maternity_leave" | "yearly_leave" | "study" | "preference";

const typeLabelKey: Record<string, string> = {
  block: "avail.blockDates",
  vacation: "avail.vacationLabel",
  leave: "avail.leaveLabel",
  sick_leave: "avail.sickLeaveLabel",
  maternity_leave: "avail.maternityLeaveLabel",
  yearly_leave: "avail.yearlyLeaveLabel",
  study: "avail.studyLabel",
  preference: "avail.preferenceLabel",
};

export default function Availability() {
  const { user, profile, confirmIfImpersonating } = useAuth();
  const viewUserId = profile?.id ?? user?.id;
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<string>("");
  const [reason, setReason] = useState("");
  const [requestType, setRequestType] = useState<AvailType>("block");
  const [blockedShifts, setBlockedShifts] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"block" | "preference">("block");

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const dayHeaders = [
    t("calendar.sun"), t("calendar.mon"), t("calendar.tue"),
    t("calendar.wed"), t("calendar.thu"), t("calendar.fri"), t("calendar.sat"),
  ];

  const { data: requests = [] } = useQuery({
    queryKey: ["availability-requests", viewUserId, format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_requests")
        .select("*")
        .eq("user_id", viewUserId!)
        .or(`date.gte.${format(monthStart, "yyyy-MM-dd")},end_date.gte.${format(monthStart, "yyyy-MM-dd")}`)
        .lte("date", format(monthEnd, "yyyy-MM-dd"))
        .order("date");
      if (error) throw error;
      return data;
    },
    enabled: !!viewUserId,
  });

  const createRequest = useMutation({
    mutationFn: async () => {
      if (!selectedDate || !viewUserId) return;
      const startStr = format(selectedDate, "yyyy-MM-dd");
      if (dialogMode === "preference") {
        if (blockedShifts.length === 0) {
          throw new Error(t("avail.requestShiftsHint"));
        }
        const { error } = await supabase.from("availability_requests").insert({
          user_id: viewUserId, date: startStr, end_date: startStr,
          reason: reason || null, request_type: "preference",
          blocked_shifts: blockedShifts,
        } as any);
        if (error) throw error;
        return;
      }
      const isBlock = requestType === "block";
      const endStr = isBlock ? startStr : (endDate || startStr);
      const { error } = await supabase.from("availability_requests").insert({
        user_id: viewUserId, date: startStr, end_date: endStr,
        reason: reason || null, request_type: requestType,
        blocked_shifts: isBlock ? blockedShifts : [],
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["availability-requests"] });
      toast.success(t("avail.submitRequest"));
      closeDialog();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("availability_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["availability-requests"] });
      toast.success("Request removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const closeDialog = () => {
    setDialogOpen(false); setReason(""); setEndDate("");
    setRequestType("block"); setBlockedShifts([]); setSelectedDate(null);
    setDialogMode("block");
  };

  const toggleShift = (shift: string) => {
    setBlockedShifts((prev) =>
      prev.includes(shift) ? prev.filter((s) => s !== shift) : [...prev, shift]
    );
  };

  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart);

  const getRequestsForDay = (day: Date) =>
    requests.filter((r) => {
      const start = parseISO(r.date);
      const end = (r as any).end_date ? parseISO((r as any).end_date) : start;
      return isSameDay(day, start) || isSameDay(day, end) || isWithinInterval(day, { start, end });
    });

  const getDayCellStyle = (dayReqs: any[]) => {
    if (dayReqs.length === 0) return "hover:bg-accent/50";
    const req = dayReqs[0];
    const type = (req as any).request_type || "block";
    if (type === "preference") {
      // Soft "placeholder" look — dashed blue
      return "shift-preferred-placeholder";
    }
    if (type === "vacation") {
      return req.status === "approved" ? "bg-blue-100 border-blue-300" : "bg-blue-50 border-blue-200";
    }
    if (isLeaveType(type)) {
      return req.status === "approved" ? "bg-purple-100 border-purple-300" : "bg-purple-50 border-purple-200";
    }
    return req.status === "approved" ? "bg-destructive/10 border-destructive/30" : "bg-yellow-50 border-yellow-200";
  };

  const formatBlockedShifts = (req: any) => {
    const shifts: string[] = (req as any).blocked_shifts || [];
    if (shifts.length === 0) return null;
    return shifts.map((s: string) => t(`shift.${s}`)).join(" & ");
  };

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      pending: t("common.pending"), approved: t("common.approved"), declined: t("common.declined"),
    };
    return map[status] || status;
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold">{t("page.availability")}</h1>
      </div>

      <div className="flex flex-wrap gap-2 md:gap-3 text-[11px] md:text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm border bg-yellow-50 border-yellow-200" /> {t("avail.legend.pending")}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm border bg-destructive/10 border-destructive/30" /> {t("avail.legend.blocked")}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm border bg-blue-100 border-blue-300" /> {t("avail.legend.vacation")}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm border bg-purple-100 border-purple-300" /> {t("avail.legend.leave")}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm border bg-green-100 border-green-200" /> {t("avail.legend.approved")}
        </span>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 px-2 md:px-6">
          <Button variant="ghost" size="icon" className="h-8 w-8 md:h-9 md:w-9" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          </Button>
          <CardTitle className="text-sm md:text-base">{formatLocale(currentMonth, "MMMM yyyy", locale)}</CardTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8 md:h-9 md:w-9" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </Button>
        </CardHeader>
        <CardContent className="px-1 md:px-6">
          <div className="grid grid-cols-7 text-center text-[10px] md:text-xs font-medium text-muted-foreground mb-0.5 md:mb-1">
            {dayHeaders.map((d, i) => (
              <div key={i} className="py-1 md:py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-[2px] md:gap-px">
            {Array.from({ length: startPad }).map((_, i) => (
              <div key={`pad-${i}`} className="aspect-square md:h-20" />
            ))}
            {days.map((day) => {
              const dayReqs = getRequestsForDay(day);
              const hasBlock = dayReqs.length > 0;
              const today = isToday(day);
              return (
                <div
                  key={day.toISOString()}
                  onClick={() => { if (!hasBlock) { setSelectedDate(day); setDialogOpen(true); } }}
                  className={`aspect-square md:aspect-auto md:h-20 rounded-md border p-0.5 md:p-1 cursor-pointer transition-colors flex flex-col items-center justify-center md:justify-start min-h-[40px] active:ring-2 active:ring-primary/50 active:border-primary ${today ? "ring-1 ring-primary/30" : ""} ${getDayCellStyle(dayReqs)}`}
                >
                  <span className={`text-[clamp(0.6rem,2.5vw,0.8rem)] md:text-xs leading-none ${today ? "font-bold text-primary" : "text-muted-foreground"}`}>
                    {format(day, "d")}
                  </span>
                  {dayReqs.map((r) => (
                    <div key={r.id} className="flex flex-col items-center gap-0 mt-0.5">
                      <span className="hidden md:inline-flex">{typeIcons[(r as any).request_type || "block"]}</span>
                      <Badge variant="outline" className={`text-[clamp(0.4rem,1.8vw,0.625rem)] md:text-[10px] px-0.5 md:px-1 py-0 leading-none whitespace-nowrap truncate max-w-full ${statusColors[r.status]}`}>
                        {statusLabel(r.status)}
                      </Badge>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {(() => {
        const blockReqs = requests.filter((r: any) => (r.request_type || "block") !== "preference");
        const prefReqs = requests.filter((r: any) => (r.request_type || "block") === "preference");
        const renderRow = (r: any) => {
          const rType = r.request_type || "block";
          const rEnd = r.end_date;
          const isRange = rEnd && rEnd !== r.date;
          const blockedLabel = formatBlockedShifts(r);
          return (
            <div key={r.id} className="flex items-start md:items-center justify-between rounded-lg border p-2 md:p-3 gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                  <p className="text-xs md:text-sm font-medium">
                    {formatLocale(new Date(r.date), "EEE, MMM d", locale)}
                    {isRange && ` → ${formatLocale(new Date(rEnd), "EEE, MMM d", locale)}`}
                  </p>
                  <Badge variant="outline" className="text-[9px] md:text-[10px] capitalize">
                    {typeIcons[rType]}
                    <span className="ms-1">{t(typeLabelKey[rType] || "avail.blockDates")}</span>
                  </Badge>
                  {blockedLabel && (
                    <Badge variant="outline" className="text-[9px] md:text-[10px]">
                      {blockedLabel} {rType === "preference" ? "" : t("avail.only")}
                    </Badge>
                  )}
                </div>
                {r.reason && <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">{r.reason}</p>}
              </div>
              <div className="flex items-center gap-1 md:gap-2 shrink-0">
                <Badge variant="outline" className={`text-[9px] md:text-xs ${statusColors[r.status]}`}>{statusLabel(r.status)}</Badge>
                {r.status === "pending" && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteRequest.mutate(r.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          );
        };

        return (
          <>
            <Card>
              <CardHeader className="px-3 md:px-6">
                <CardTitle className="text-sm md:text-base">{t("avail.yourRequests")}</CardTitle>
              </CardHeader>
              <CardContent className="px-3 md:px-6">
                {blockReqs.length === 0 ? (
                  <p className="text-xs md:text-sm text-muted-foreground">{t("avail.noRequests")}</p>
                ) : (
                  <div className="space-y-2">{blockReqs.map(renderRow)}</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="px-3 md:px-6">
                <CardTitle className="text-sm md:text-base flex items-center gap-2">
                  <Star className="h-4 w-4 text-blue-600" />
                  {t("avail.preferences")}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 md:px-6">
                {prefReqs.length === 0 ? (
                  <p className="text-xs md:text-sm text-muted-foreground">{t("avail.noPreferences")}</p>
                ) : (
                  <div className="space-y-2">{prefReqs.map(renderRow)}</div>
                )}
              </CardContent>
            </Card>
          </>
        );
      })()}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent className="max-w-[95vw] md:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base md:text-lg">{t("avail.newRequest")}</DialogTitle>
          </DialogHeader>
          {selectedDate && (
            <div className="space-y-4">
              <Tabs value={dialogMode} onValueChange={(v) => { setDialogMode(v as any); setBlockedShifts([]); setReason(""); setEndDate(""); if (v === "block") setRequestType("block"); }}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="block">{t("avail.blockTab")}</TabsTrigger>
                  <TabsTrigger value="preference">{t("avail.preferenceTab")}</TabsTrigger>
                </TabsList>
              </Tabs>

              {dialogMode === "block" ? (
                <>
                  <div className="space-y-2">
                    <Label>{t("common.type")}</Label>
                    <Select value={requestType} onValueChange={(v: any) => { setRequestType(v); setBlockedShifts([]); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="block">
                          <span className="flex items-center gap-2"><CalendarOff className="h-3 w-3" /> {t("avail.blockDates")}</span>
                        </SelectItem>
                        <SelectItem value="vacation">
                          <span className="flex items-center gap-2"><Palmtree className="h-3 w-3" /> {t("avail.vacationLabel")}</span>
                        </SelectItem>
                        <SelectItem value="sick_leave">
                          <span className="flex items-center gap-2"><Bandage className="h-3 w-3" /> {t("avail.sickLeaveLabel")}</span>
                        </SelectItem>
                        <SelectItem value="maternity_leave">
                          <span className="flex items-center gap-2"><Baby className="h-3 w-3" /> {t("avail.maternityLeaveLabel")}</span>
                        </SelectItem>
                        <SelectItem value="yearly_leave">
                          <span className="flex items-center gap-2"><Palmtree className="h-3 w-3" /> {t("avail.yearlyLeaveLabel")}</span>
                        </SelectItem>
                        <SelectItem value="study">
                          <span className="flex items-center gap-2"><GraduationCap className="h-3 w-3" /> {t("avail.studyLabel")}</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {requestType === "block" ? (
                    <>
                      <div className="space-y-2">
                        <Label>{t("common.date")}</Label>
                        <Input type="date" value={format(selectedDate, "yyyy-MM-dd")} onChange={(e) => {
                          const d = new Date(e.target.value + "T00:00:00");
                          if (!isNaN(d.getTime())) setSelectedDate(d);
                        }} />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("avail.blockShifts")}</Label>
                        <p className="text-xs text-muted-foreground">{t("avail.blockShiftsHint")}</p>
                        <div className="flex gap-3">
                          {SHIFT_TYPES.map((type) => (
                            <label key={type} className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox checked={blockedShifts.includes(type)} onCheckedChange={() => toggleShift(type)} />
                              <span>{t(`shift.${type}`)}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>{t("avail.startDate")}</Label>
                        <Input type="date" value={format(selectedDate, "yyyy-MM-dd")} readOnly className="bg-muted" />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("avail.endDate")}</Label>
                        <Input type="date" value={endDate || format(selectedDate, "yyyy-MM-dd")} min={format(selectedDate, "yyyy-MM-dd")} onChange={(e) => setEndDate(e.target.value)} />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>{t("common.date")}</Label>
                    <Input type="date" value={format(selectedDate, "yyyy-MM-dd")} onChange={(e) => {
                      const d = new Date(e.target.value + "T00:00:00");
                      if (!isNaN(d.getTime())) setSelectedDate(d);
                    }} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("avail.requestSpecificShifts")}</Label>
                    <div className="flex gap-3">
                      {SHIFT_TYPES.map((type) => (
                        <label key={type} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox checked={blockedShifts.includes(type)} onCheckedChange={() => toggleShift(type)} />
                          <span>{t(`shift.${type}`)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label>{t("avail.reasonOptional")}</Label>
                <Input placeholder={t("avail.reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>

              <div className="flex flex-col-reverse md:flex-row gap-2 md:justify-end">
                <Button variant="outline" onClick={closeDialog} className="w-full md:w-auto">{t("common.cancel")}</Button>
                <Button
                  onClick={() => createRequest.mutate()}
                  disabled={createRequest.isPending || (dialogMode === "preference" && blockedShifts.length === 0)}
                  className="w-full md:w-auto"
                >
                  {t("avail.submitRequest")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
