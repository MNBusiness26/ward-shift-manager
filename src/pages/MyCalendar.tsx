import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sun, Sunset, Moon, Users, RefreshCw, Star, CheckCircle2, FileDown, PhoneCall, LogOut } from "lucide-react";
import { CalendarSyncDialog } from "@/components/calendar/CalendarSyncDialog";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
} from "date-fns";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHolidayMap } from "@/hooks/useHolidays";
import { HolidayCellBackground, HolidayCornerIcon } from "@/components/holidays/HolidayCell";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShiftDetailCard } from "@/components/calendar/ShiftDetailCard";
import { useMyShifts, useMyRole, useDayShifts, useAllShiftsInRange, type Shift } from "@/components/calendar/useMyCalendarData";
import { useTranslation } from "@/i18n/useTranslation";
import { formatLocale } from "@/i18n/dateLocale";
import { exportMyAttendancePDF } from "@/lib/payrollExport";

const shiftDot: Record<string, string> = {
  morning: "bg-shift-morning",
  evening: "bg-shift-evening",
  night: "bg-shift-night",
};

const shiftBadgeColors: Record<string, string> = {
  morning: "bg-shift-morning/10 text-shift-morning border-s-2 border-s-shift-morning",
  evening: "bg-shift-evening/10 text-shift-evening border-s-2 border-s-shift-evening",
  night: "bg-shift-night/10 text-shift-night border-s-2 border-s-shift-night",
};

export default function MyCalendar() {
  const { user, profile } = useAuth();
  const holidayMap = useHolidayMap();
  const { t, locale } = useTranslation();
  const [view, setView] = useState<"month" | "week">("month");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [currentWeek, setCurrentWeek] = useState(startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const hasSyncLink = !!(profile as any)?.calendar_token;

  const rangeStart = view === "month" ? startOfMonth(currentMonth) : currentWeek;
  const rangeEnd = view === "month" ? endOfMonth(currentMonth) : endOfWeek(currentWeek, { weekStartsOn: 0 });

  const { data: shifts = [] } = useMyShifts(rangeStart, rangeEnd);
  const { data: allShifts = [] } = useAllShiftsInRange(rangeStart, rangeEnd);
  const { data: myRoles = [] } = useMyRole();
  const selectedDateStr = selectedDay ? format(selectedDay, "yyyy-MM-dd") : null;
  const { data: dayAllShifts = [] } = useDayShifts(selectedDateStr);

  // Approved leaves overlapping the visible range — used for PDF export
  const monthStartStr = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const monthEndStr = format(endOfMonth(currentMonth), "yyyy-MM-dd");
  const { data: myLeaves = [] } = useQuery({
    queryKey: ["my-leaves", profile?.id, monthStartStr, monthEndStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_requests")
        .select("request_type, date, end_date, reason")
        .eq("user_id", profile!.id)
        .eq("status", "approved")
        .lte("date", monthEndStr)
        .or(`end_date.gte.${monthStartStr},and(end_date.is.null,date.gte.${monthStartStr})`);
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile,
  });

  const myRole = myRoles[0] || "nurse";

  const shiftLabels: Record<string, string> = { morning: t("shift.morning"), evening: t("shift.evening"), night: t("shift.night") };

  const getShiftsForDay = (day: Date) =>
    shifts.filter((s) => isSameDay(new Date(s.date), day));

  const getColleaguesForShift = (day: Date, shiftType: string) => {
    const dateStr = format(day, "yyyy-MM-dd");
    return allShifts.filter(
      (s) => s.date === dateStr && s.type === shiftType && s.assigned_user_id !== profile?.id
    );
  };

  const getColleaguesByShift = (shiftType: string) =>
    dayAllShifts.filter(
      (s) => s.type === shiftType && s.assigned_user_id !== profile?.id
    );

  const myDayShifts = selectedDay ? getShiftsForDay(selectedDay) : [];

  const monthDays = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  const startPad = getDay(startOfMonth(currentMonth));
  const weekDays = eachDayOfInterval({ start: currentWeek, end: endOfWeek(currentWeek, { weekStartsOn: 0 }) });

  const shiftIcons: Record<string, React.ElementType> = { morning: Sun, evening: Sunset, night: Moon };

  const dayHeaders = [
    t("calendar.sun"), t("calendar.mon"), t("calendar.tue"),
    t("calendar.wed"), t("calendar.thu"), t("calendar.fri"), t("calendar.sat"),
  ];

  const generateIcs = () => {
    const events = shifts.map((s) => {
      const dateClean = s.date.replace(/-/g, "");
      const startH = s.start_time.slice(0, 2);
      const startM = s.start_time.slice(3, 5);
      const endH = s.end_time.slice(0, 2);
      const endM = s.end_time.slice(3, 5);
      let endDate = dateClean;
      if (parseInt(endH) < parseInt(startH)) {
        const d = new Date(s.date);
        d.setDate(d.getDate() + 1);
        endDate = format(d, "yyyyMMdd");
      }
      const colleagues = allShifts
        .filter((a) => a.date === s.date && a.type === s.type && a.assigned_user_id !== profile?.id)
        .map((a) => (a.profiles as any)?.full_name || "Unknown");
      const teamList = colleagues.length > 0 ? `\\nTeam: ${colleagues.join(", ")}` : "";
      const desc = `${shiftLabels[s.type] || s.type} Shift${s.is_responsible_on_shift ? " (Responsible)" : ""}${teamList}`;
      return [
        "BEGIN:VEVENT",
        `DTSTART:${dateClean}T${startH}${startM}00`,
        `DTEND:${endDate}T${endH}${endM}00`,
        `SUMMARY:${shiftLabels[s.type] || s.type} Shift${s.is_responsible_on_shift ? " ★" : ""}`,
        `DESCRIPTION:${desc}`,
        `UID:${s.id}@wardwise`,
        "END:VEVENT",
      ].join("\r\n");
    });
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WardWise//Shifts//EN", "CALSCALE:GREGORIAN",
      ...events, "END:VCALENDAR",
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `my-shifts-${format(rangeStart, "yyyy-MM")}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">{t("page.myCalendar")}</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => exportMyAttendancePDF({
              fullName: profile?.full_name || "",
              monthLabel: formatLocale(currentMonth, "MMMM yyyy", locale),
              shifts: shifts.filter((s) => {
                const d = new Date(s.date);
                return d >= startOfMonth(currentMonth) && d <= endOfMonth(currentMonth);
              }) as any,
              leave: (myLeaves as any[]).map((l) => ({
                type: l.request_type, date: l.date, end_date: l.end_date, reason: l.reason,
              })),
            })}
          >
            <FileDown className="h-4 w-4" />
            <span className="hidden sm:inline">{t("payroll.exportMyAttendance")}</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSyncOpen(true)}>
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">{hasSyncLink ? t("calendar.manageSync") : t("calendar.syncCalendar")}</span>
            <span className="sm:hidden">{t("calendar.sync")}</span>
          </Button>
          <Tabs value={view} onValueChange={(v) => setView(v as "month" | "week")}>
            <TabsList>
              <TabsTrigger value="month">{t("calendar.month")}</TabsTrigger>
              <TabsTrigger value="week">{t("calendar.week")}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {view === "month" ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            </Button>
            <CardTitle className="text-base">{formatLocale(currentMonth, "MMMM yyyy", locale)}</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="h-4 w-4 rtl:rotate-180" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-px text-center text-xs font-medium text-muted-foreground mb-1">
              {dayHeaders.map((d, i) => (
                <div key={i} className="py-2">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px">
              {Array.from({ length: startPad }).map((_, i) => (
                <div key={`pad-${i}`} className="h-20 md:h-24" />
              ))}
              {monthDays.map((day) => {
                const dayShifts = getShiftsForDay(day);
                const isSelected = selectedDay && isSameDay(day, selectedDay);
                const holiday = holidayMap.get(format(day, "yyyy-MM-dd"));
                return (
                  <div
                    key={day.toISOString()}
                    className={`relative min-h-[5rem] md:min-h-[7rem] rounded-md border border-solid p-2 text-sm md:text-base leading-[1.5] hover:bg-accent/50 cursor-pointer transition-colors ${
                      isSameDay(day, new Date()) ? "bg-primary/5 border-primary/30" : ""
                    } ${isSelected ? "ring-2 ring-primary" : ""}`}
                    onClick={() => setSelectedDay(day)}
                  >
                    <HolidayCellBackground holiday={holiday} />
                    <HolidayCornerIcon holiday={holiday} />
                    <span className="text-muted-foreground">{format(day, "d")}</span>
                    <div className="mt-0.5 flex flex-col gap-1 overflow-hidden">
                      {dayShifts.map((s) => {
                        const Icon = shiftIcons[s.type] || Sun;
                        const colleagues = getColleaguesForShift(day, s.type);
                        return (
                          <div key={s.id}>
                            <div
                              className={`flex items-center gap-0.5 rounded px-0.5 py-px text-[9px] leading-tight border ${
                                s.is_draft
                                  ? `bg-draft-stripes border-dashed ${shiftBadgeColors[s.type]}`
                                  : s.is_standby
                                  ? `border-blue-400 ${shiftBadgeColors[s.type]}`
                                  : shiftBadgeColors[s.type]
                              }`}
                              title={`${shiftLabels[s.type]} ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}${s.is_responsible_on_shift ? ` ★ ${t("calendar.responsible")}` : ""}${s.is_draft ? " (Draft)" : ""}${s.is_standby ? ` ${t("payroll.onCall")}` : ""}`}
                            >
                              <Icon className="h-2.5 w-2.5 flex-shrink-0" />
                              <span className="truncate hidden md:inline">{s.start_time.slice(0, 5)}</span>
                              <span className="truncate md:hidden">{shiftLabels[s.type]?.slice(0, 3)}</span>
                              {s.is_responsible_on_shift && (
                                <Star className="h-2.5 w-2.5 fill-primary text-primary flex-shrink-0" />
                              )}
                              {s.is_standby && (
                                <PhoneCall className="h-2.5 w-2.5 text-blue-600 flex-shrink-0" />
                              )}
                              {s.is_external && (
                                <LogOut className="h-2.5 w-2.5 text-slate-600 flex-shrink-0" />
                              )}
                              {s.is_verified && <CheckCircle2 className="h-2.5 w-2.5 text-green-600 flex-shrink-0 ms-auto" />}
                            </div>
                            {colleagues.length > 0 && (
                              <div className="flex flex-col ps-0.5 mt-px">
                                {colleagues.map((c) => (
                                  <span key={c.id} className="text-[8px] leading-[1.3] text-muted-foreground truncate">
                                    {(c.profiles as any)?.full_name?.split(" ")[0] || "?"}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <Button variant="ghost" size="icon" onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}>
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            </Button>
            <CardTitle className="text-base">
              {formatLocale(currentWeek, "MMM d", locale)} — {formatLocale(endOfWeek(currentWeek, { weekStartsOn: 0 }), "MMM d, yyyy", locale)}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}>
              <ChevronRight className="h-4 w-4 rtl:rotate-180" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {weekDays.map((day) => {
              const dayShifts = getShiftsForDay(day);
              const isToday = isSameDay(day, new Date());
              return (
                <div
                  key={day.toISOString()}
                  className={`rounded-lg border p-3 space-y-2 ${isToday ? "bg-primary/5 border-primary/30" : ""}`}
                >
                  <div className="font-medium text-sm">
                    {formatLocale(day, "EEEE, MMM d", locale)}
                    {isToday && <span className="ms-2 text-xs text-primary font-normal">({t("dashboard.today")})</span>}
                  </div>
                  {dayShifts.length === 0 ? (
                    <p className="text-xs text-muted-foreground ps-2">{t("common.noShifts")}</p>
                  ) : (
                    dayShifts.map((shift) => {
                      const Icon = shiftIcons[shift.type] || Sun;
                      const colleagues = getColleaguesForShift(day, shift.type);
                      return (
                        <div
                          key={shift.id}
                          className={`ps-2 py-1.5 rounded hover:bg-accent/50 cursor-pointer space-y-1 ${
                            shift.is_draft ? "bg-draft-stripes border border-dashed" : ""
                          } ${shift.is_standby ? "border border-blue-400" : ""}`}
                          onClick={() => setSelectedDay(day)}
                        >
                          <div className="flex items-center gap-3 text-sm">
                            <div className={`h-2.5 w-2.5 rounded-full ${shiftDot[shift.type]}`} />
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <span>{shiftLabels[shift.type]}</span>
                            <span className="text-muted-foreground">
                              {shift.start_time.slice(0, 5)} — {shift.end_time.slice(0, 5)}
                            </span>
                            {shift.is_responsible_on_shift && (
                              <Star className="h-3 w-3 fill-primary text-primary" />
                            )}
                            {shift.is_draft && (
                              <span className="text-[10px] uppercase tracking-wide text-muted-foreground border rounded px-1">Draft</span>
                            )}
                            {shift.is_standby && (
                              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-blue-600 border border-blue-400 rounded px-1">
                                <PhoneCall className="h-2.5 w-2.5" />
                                {t("payroll.onCall")}
                              </span>
                            )}
                            {shift.is_external && (
                              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-700 border border-slate-400 rounded px-1">
                                <LogOut className="h-2.5 w-2.5" />
                                {t("shift.awayFromWard") !== "shift.awayFromWard" ? t("shift.awayFromWard") : "Away"}
                              </span>
                            )}
                          </div>
                          {colleagues.length > 0 && (
                            <div className="flex items-center gap-1.5 ps-7 text-xs text-muted-foreground">
                              <Users className="h-3 w-3 flex-shrink-0" />
                              <span>
                                {colleagues.map((c) => (c.profiles as any)?.full_name || t("common.unknown")).join(", ")}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedDay} onOpenChange={() => setSelectedDay(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedDay && formatLocale(selectedDay, "EEEE, MMMM d, yyyy", locale)}</DialogTitle>
          </DialogHeader>
          {myDayShifts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{t("calendar.noShiftsDay")}</p>
          ) : (
            <div className="space-y-4">
              {myDayShifts.map((shift) => (
                <ShiftDetailCard
                  key={shift.id}
                  shift={shift}
                  myRole={myRole}
                  colleagues={getColleaguesByShift(shift.type)}
                />
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CalendarSyncDialog open={syncOpen} onOpenChange={setSyncOpen} />
    </div>
  );
}
