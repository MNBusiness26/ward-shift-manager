import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, addMonths, subMonths, addWeeks, subWeeks, isToday, isSameMonth,
} from "date-fns";
import { Fragment, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/AuthContext";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChevronLeft, ChevronRight, Users, Star, Phone, ArrowLeftRight, FileDown } from "lucide-react";
import { exportCalendarToPdf } from "@/lib/exportCalendarPdf";
import { useTranslation } from "@/i18n/useTranslation";
import { formatLocale } from "@/i18n/dateLocale";
import { Badge } from "@/components/ui/badge";
import { compareShiftAssignment, formatDisplayName } from "@/components/roster/staffSort";
import { useHolidayMap } from "@/hooks/useHolidays";
import { HolidayCellBackground, HolidayCornerIcon } from "@/components/holidays/HolidayCell";

const isAssistant = (role?: string | null) => role === "assistant";

const shiftTypes = ["morning", "evening", "night"] as const;

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

const shiftDotColors: Record<string, string> = {
  morning: "bg-shift-morning",
  evening: "bg-shift-evening",
  night: "bg-shift-night",
};

export default function GlobalTeamCalendar() {
  const { t, locale } = useTranslation();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [view, setView] = useState<"month" | "week">("week");
  const [isExporting, setIsExporting] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  const holidayMap = useHolidayMap();
  const isMobile = useIsMobile();
  const { profile: effectiveProfile } = useAuth();
  const myId = effectiveProfile?.id;

  const shiftLabels: Record<string, string> = {
    morning: t("shift.morning"), evening: t("shift.evening"), night: t("shift.night"),
  };

  const dayHeaders = [
    t("calendar.sun"), t("calendar.mon"), t("calendar.tue"),
    t("calendar.wed"), t("calendar.thu"), t("calendar.fri"), t("calendar.sat"),
  ];

  const isWeek = view === "week";
  const rangeStart = isWeek
    ? startOfWeek(currentMonth, { weekStartsOn: 0 })
    : startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
  const rangeEnd = isWeek
    ? endOfWeek(currentMonth, { weekStartsOn: 0 })
    : endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
  const calendarStart = rangeStart;
  const calendarEnd = rangeEnd;
  const allDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const { data: shifts = [] } = useQuery({
    queryKey: ["global-team-shifts", format(calendarStart, "yyyy-MM-dd"), format(calendarEnd, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*, assigned_profile:assigned_user_id(full_name, is_responsible, role), manager_profile:manager_on_duty_id(full_name)")
        .eq("is_draft", false)
        .gte("date", format(calendarStart, "yyyy-MM-dd"))
        .lte("date", format(calendarEnd, "yyyy-MM-dd"))
        .order("date").order("start_time");
      if (error) throw error;
      return data;
    },
  });

  const getShifts = (dateStr: string, type: string) =>
    shifts.filter((s) => s.date === dateStr && s.type === type);

  const weeks: Date[][] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7));
  }

  const handleExportPdf = async () => {
    if (!calendarRef.current) return;
    setIsExporting(true);
    try {
      const titleStr = isWeek
        ? `${formatLocale(calendarStart, "d MMM", locale)} – ${formatLocale(calendarEnd, "d MMM yyyy", locale)}`
        : formatLocale(currentMonth, "MMMM yyyy", locale);
      const fileBase = isWeek
        ? `team-calendar-week-${format(calendarStart, "yyyy-MM-dd")}`
        : `team-calendar-${format(currentMonth, "yyyy-MM")}`;
      await exportCalendarToPdf({
        element: calendarRef.current,
        fileName: fileBase,
        title: `${t("page.teamCalendar")} — ${titleStr}`,
        orientation: "landscape",
        format: isWeek ? "a4" : "a3",
        direction: locale === "he" ? "rtl" : "ltr",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4 flex flex-col min-h-[calc(100vh-6rem)]">
      <div className="flex flex-row flex-wrap items-center justify-between gap-1">
        <h1 className="text-base md:text-2xl font-bold flex items-center gap-1 md:gap-2">
          <Users className="h-4 w-4 md:h-6 md:w-6" />
          {t("page.teamCalendar")}
        </h1>
        <div className="flex items-center gap-1 md:gap-2 flex-wrap">
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => v && setView(v as "month" | "week")}
            size="sm"
            variant="outline"
            className="h-8"
          >
            <ToggleGroupItem value="month" className="h-8 px-2 text-xs md:text-sm">{t("calendar.month") || "Month"}</ToggleGroupItem>
            <ToggleGroupItem value="week" className="h-8 px-2 text-xs md:text-sm">{t("calendar.week") || "Week"}</ToggleGroupItem>
          </ToggleGroup>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() =>
              setCurrentMonth((m) => (isWeek ? subWeeks(m, 1) : subMonths(m, 1)))
            }
          >
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 px-2 text-xs md:text-sm" onClick={() => setCurrentMonth(new Date())}>
            {isWeek ? t("calendar.thisWeek") : t("calendar.thisMonth")}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() =>
              setCurrentMonth((m) => (isWeek ? addWeeks(m, 1) : addMonths(m, 1)))
            }
          >
            <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            onClick={handleExportPdf}
            disabled={isExporting}
          >
            <FileDown className="h-4 w-4 md:me-2" />
            <span className="hidden md:inline">{t("common.exportPdf") || "Export PDF"}</span>
          </Button>
        </div>
      </div>

      <Card ref={calendarRef} className="flex-1 flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-center">
            {isWeek
              ? `${formatLocale(calendarStart, "d MMM", locale)} – ${formatLocale(calendarEnd, "d MMM yyyy", locale)}`
              : formatLocale(currentMonth, "MMMM yyyy", locale)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 flex-1 flex flex-col">
          {isMobile ? (
            <div className="flex flex-col gap-3">
              {allDays.filter((d) => isWeek || isSameMonth(d, currentMonth)).map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const today = isToday(day);
                const holiday = holidayMap.get(dateStr);
                return (
                  <div key={dateStr} className={`rounded-lg border ${today ? "ring-2 ring-primary/40" : ""}`}>
                    <div className={`flex items-center justify-between px-3 py-2 border-b ${holiday ? "bg-[hsla(274,53%,60%,0.12)]" : "bg-muted/40"}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{formatLocale(day, "EEEE", locale)}</span>
                        <span className="text-xs text-muted-foreground">{formatLocale(day, "d MMM", locale)}</span>
                      </div>
                      <HolidayCornerIcon holiday={holiday} inline />
                    </div>
                    <div className="flex flex-col">
                      {shiftTypes.map((type) => {
                        const typeShifts = getShifts(dateStr, type);
                        const mineOnShift = !!myId && typeShifts.some((s) => (s as any).assigned_user_id === myId);
                        const bg =
                          type === "morning" ? "bg-[#DAA520]/15 border-s-4 border-s-[#DAA520]" :
                          type === "evening" ? "bg-[#FF7F50]/15 border-s-4 border-s-[#FF7F50]" :
                          "bg-[#4B0082]/15 border-s-4 border-s-[#4B0082]";
                        const labelColor =
                          type === "morning" ? "text-[#8B6508]" :
                          type === "evening" ? "text-[#C2410C]" :
                          "text-[#4B0082]";
                        return (
                          <div
                            key={type}
                            className={`px-3 py-2 border-b last:border-b-0 ${bg} ${mineOnShift ? "border-4 border-[#3B82F6]" : ""}`}
                            style={{ lineHeight: 1.5 }}
                          >
                            <div className={`text-xs font-bold uppercase tracking-wide mb-1.5 ${labelColor}`}>
                              {shiftLabels[type]}
                            </div>
                            {typeShifts.length === 0 ? (
                              <div className="text-xs text-muted-foreground italic">—</div>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {typeShifts.map((s) => {
                                  const profile = (s as any).assigned_profile;
                                  const isStandby = (s as any).is_standby;
                                  const isExternal = (s as any).is_external;
                                  const isResp = s.is_responsible_on_shift || profile?.is_responsible;
                                  const assistantRole = isAssistant(profile?.role);
                                  const firstName = formatDisplayName(profile?.full_name);
                                  return (
                                    <span
                                      key={s.id}
                                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border whitespace-normal break-words ${
                                        assistantRole
                                          ? "bg-white text-[#0F172A] border-slate-300"
                                          : isExternal
                                          ? "bg-slate-50 border-slate-300 text-slate-600"
                                          : isStandby
                                          ? "bg-blue-50 border-blue-400 text-foreground"
                                          : "bg-background border-current/30 text-foreground"
                                      } ${isResp ? "font-bold" : ""}`}
                                      style={{ fontFamily: "Heebo, Inter, sans-serif", lineHeight: 1.5 }}
                                    >
                                      {isExternal && <ArrowLeftRight className="h-3 w-3 shrink-0" />}
                                      <span>{firstName}</span>
                                      {isResp && <Star className="h-3 w-3 fill-current shrink-0" />}
                                      {isStandby && <Phone className="h-3 w-3 shrink-0" />}
                                    </span>
                                  );
                                })}
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
          ) : (
          <table className="w-full text-sm border-collapse table-fixed flex-1 h-full">
            <colgroup>
              {dayHeaders.map((_, i) => (
                <col key={i} style={{ width: `${100 / 7}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {dayHeaders.map((d, i) => (
                  <th key={i} className="p-1.5 text-center font-medium text-muted-foreground text-xs border-b">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, wi) => (
                <Fragment key={wi}>
                  {/* Date header row for this week */}
                  <tr key={`dates-${wi}`} className="border-t">
                    {week.map((day) => {
                      const dateStr = format(day, "yyyy-MM-dd");
                      const inMonth = isWeek || isSameMonth(day, currentMonth);
                      const today = isToday(day);
                      const holiday = holidayMap.get(dateStr);
                      return (
                        <td
                          key={`d-${dateStr}`}
                          className={`border-s p-1 align-top ${!inMonth ? "bg-muted/30" : ""} ${today ? "ring-2 ring-inset ring-primary/40" : ""}`}
                        >
                          <div
                            className={`flex items-center justify-between px-1 rounded-sm overflow-hidden ${holiday && !holiday.is_eve ? "bg-[hsla(274,53%,60%,0.15)]" : ""}`}
                            style={holiday?.is_eve ? { backgroundImage: "repeating-linear-gradient(45deg, hsla(274,53%,60%,0.22) 0 6px, transparent 6px 14px)" } : undefined}
                          >
                            <span className={`text-xs font-medium ${!inMonth ? "text-muted-foreground/50" : today ? "text-primary font-bold" : holiday ? "text-purple-700 font-semibold" : "text-muted-foreground"}`}>
                              {format(day, "d")}
                            </span>
                            <HolidayCornerIcon holiday={holiday} inline />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                  {/* One row per shift type, so morning/evening/night align across all days */}
                  {shiftTypes.map((type) => (
                    <tr key={`${wi}-${type}`} className="align-top">
                      {week.map((day) => {
                        const dateStr = format(day, "yyyy-MM-dd");
                        const inMonth = isWeek || isSameMonth(day, currentMonth);
                        const today = isToday(day);
                        const typeShifts = inMonth
                          ? getShifts(dateStr, type).slice().sort((a, b) => {
                              const pa = (a as any).assigned_profile;
                              const pb = (b as any).assigned_profile;
                              return compareShiftAssignment(
                                {
                                  full_name: pa?.full_name || "",
                                  is_responsible_on_shift: (a as any).is_responsible_on_shift,
                                  is_responsible: pa?.is_responsible,
                                  role: pa?.role,
                                  is_standby: (a as any).is_standby,
                                },
                                {
                                  full_name: pb?.full_name || "",
                                  is_responsible_on_shift: (b as any).is_responsible_on_shift,
                                  is_responsible: pb?.is_responsible,
                                  role: pb?.role,
                                  is_standby: (b as any).is_standby,
                                },
                              );
                            })
                          : [];
                        return (
                          <td
                            key={`${dateStr}-${type}`}
                            className={`border-s p-1 align-top ${!inMonth ? "bg-muted/30" : ""} ${today ? "ring-1 ring-inset ring-primary/30" : ""}`}
                          >
                            {inMonth && (
                              <div className={`calendar-shift-box rounded border px-1 py-0.5 h-full ${shiftColors[type]}`}>
                                <div className={`text-[9px] font-semibold ${shiftTextColors[type]} flex items-center gap-0.5 mb-1`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${shiftDotColors[type]}`} />
                                  {shiftLabels[type]}
                                </div>
                                <div className="calendar-staff-list flex flex-col gap-1">
                                  {typeShifts.map((s) => {
                                    const profile = (s as any).assigned_profile;
                                    const isStandby = (s as any).is_standby;
                                    const isExternal = (s as any).is_external;
                                    const isResp = s.is_responsible_on_shift || profile?.is_responsible;
                                    const assistantRole = isAssistant(profile?.role);
                                    const firstName = formatDisplayName(profile?.full_name);
                                    return (
                                      <Badge
                                        key={s.id}
                                        variant={s.is_responsible_on_shift ? "default" : "secondary"}
                                        className={`calendar-staff-badge flex w-full min-w-0 items-center gap-0.5 text-[10px] px-1.5 py-0 leading-tight shadow-none whitespace-nowrap overflow-hidden ${s.is_responsible_on_shift ? "font-bold" : "font-normal"} ${
                                          isExternal
                                            ? "bg-slate-50 border-slate-200 text-slate-400 opacity-80"
                                            : isStandby
                                            ? "bg-blue-50/60 border-l-4 border-blue-400 border-t-0 border-r-0 border-b-0 rounded-sm text-foreground"
                                            : (s as any).is_draft ? "bg-draft-stripes opacity-100" : "ring-1 ring-current/20"
                                        } ${assistantRole && !s.is_responsible_on_shift && !isExternal && !isStandby ? "bg-white text-[#0F172A] border-slate-300" : ""}`}
                                      >
                                        {isExternal && <ArrowLeftRight className="h-2.5 w-2.5 shrink-0" />}
                                        <span className="calendar-staff-name truncate min-w-0 flex-1">{firstName}</span>
                                        {isResp && <Star className="h-2.5 w-2.5 fill-current shrink-0" />}
                                        {isStandby && <Phone className="h-2.5 w-2.5 shrink-0" />}
                                      </Badge>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        {shiftTypes.map((type) => (
          <div key={type} className="flex items-center gap-1">
            <span className={`w-2.5 h-2.5 rounded-full ${shiftDotColors[type]}`} />
            <span>{shiftLabels[type]}</span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <span className="font-bold text-foreground text-[11px]">{t("common.name")}</span>
          <Star className="h-2.5 w-2.5 fill-current" />
          <span>{t("calendar.responsible")}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px]">{t("common.name")}</span>
          <Phone className="h-2.5 w-2.5 text-blue-500" />
          <span>{t("calendar.onCall")}</span>
        </div>
        <div className="flex items-center gap-1">
          <ArrowLeftRight className="h-2.5 w-2.5" />
          <span>{t("common.external") || "External"}</span>
        </div>
      </div>
    </div>
  );
}
