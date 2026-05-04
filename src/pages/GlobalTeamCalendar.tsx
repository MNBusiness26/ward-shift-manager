import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, addMonths, subMonths, addWeeks, subWeeks, isToday, isSameMonth,
} from "date-fns";
import { useRef, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChevronLeft, ChevronRight, Users, Star, Phone, ArrowLeftRight, FileDown } from "lucide-react";
import { exportCalendarToPdf } from "@/lib/exportCalendarPdf";
import { useTranslation } from "@/i18n/useTranslation";
import { formatLocale } from "@/i18n/dateLocale";
import { Badge } from "@/components/ui/badge";
import { compareShiftAssignment, formatDisplayName } from "@/components/roster/staffSort";

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
  const [view, setView] = useState<"month" | "week">("month");
  const [isExporting, setIsExporting] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="space-y-4 flex flex-col min-h-[calc(100vh-6rem)]">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" />
          {t("page.teamCalendar")}
        </h1>
        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => v && setView(v as "month" | "week")}
            size="sm"
            variant="outline"
          >
            <ToggleGroupItem value="month">{t("calendar.month") || "Month"}</ToggleGroupItem>
            <ToggleGroupItem value="week">{t("calendar.week") || "Week"}</ToggleGroupItem>
          </ToggleGroup>
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              setCurrentMonth((m) => (isWeek ? subWeeks(m, 1) : subMonths(m, 1)))
            }
          >
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>
            {isWeek ? t("calendar.thisWeek") : t("calendar.thisMonth")}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              setCurrentMonth((m) => (isWeek ? addWeeks(m, 1) : addMonths(m, 1)))
            }
          >
            <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </Button>
        </div>
      </div>

      <Card className="flex-1 flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-center">
            {isWeek
              ? `${formatLocale(calendarStart, "d MMM", locale)} – ${formatLocale(calendarEnd, "d MMM yyyy", locale)}`
              : formatLocale(currentMonth, "MMMM yyyy", locale)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 flex-1 flex flex-col">
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
                <tr key={wi} className="border-t">
                  {week.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const inMonth = isWeek || isSameMonth(day, currentMonth);
                    const today = isToday(day);
                    return (
                      <td
                        key={dateStr}
                        className={`p-1 border-s align-top min-h-[140px] h-[14vh] ${!inMonth ? "bg-muted/30" : ""} ${today ? "ring-2 ring-inset ring-primary/40" : ""}`}
                      >
                        <div className={`text-xs font-medium mb-1 ${!inMonth ? "text-muted-foreground/50" : today ? "text-primary font-bold" : "text-muted-foreground"}`}>
                          {format(day, "d")}
                        </div>
                        {inMonth && (
                          <div className="space-y-1">
                            {shiftTypes.map((type) => {
                              const typeShifts = getShifts(dateStr, type).slice().sort((a, b) => {
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
                              });
                              if (typeShifts.length === 0) return null;
                              return (
                                <div key={type} className={`rounded border px-1 py-0.5 ${shiftColors[type]}`}>
                                  <div className={`text-[9px] font-semibold ${shiftTextColors[type]} flex items-center gap-0.5 mb-1`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${shiftDotColors[type]}`} />
                                    {shiftLabels[type]}
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    {typeShifts.map((s) => {
                                      const profile = s.assigned_profile as any;
                                      const isStandby = (s as any).is_standby;
                                      const isExternal = (s as any).is_external;
                                      const isResp = s.is_responsible_on_shift || profile?.is_responsible;
                                      const assistantRole = isAssistant(profile?.role);
                                      const firstName = formatDisplayName(profile?.full_name);
                                      return (
                                        <Badge
                                          key={s.id}
                                          variant={s.is_responsible_on_shift ? "default" : "secondary"}
                                          className={`text-[10px] px-1.5 py-0 leading-tight shadow-none ${s.is_responsible_on_shift ? "font-bold" : "font-normal"} ${
                                            isExternal
                                              ? "bg-slate-50 border-slate-200 text-slate-400 opacity-80"
                                              : isStandby
                                              ? "bg-blue-50/60 border-l-4 border-blue-400 border-t-0 border-r-0 border-b-0 rounded-sm text-foreground"
                                              : (s as any).is_draft ? "opacity-60 border-dashed" : "ring-1 ring-current/20"
                                          } ${assistantRole && !s.is_responsible_on_shift && !isExternal && !isStandby ? "bg-gray-100/50 text-muted-foreground border-muted-foreground/20" : ""}`}
                                        >
                                          {isExternal && <ArrowLeftRight className="me-0.5 h-2.5 w-2.5 inline" />}
                                          {firstName}
                                          {isResp && <Star className="ms-0.5 h-2.5 w-2.5 inline fill-current" />}
                                          {isStandby && <Phone className="ms-0.5 h-2.5 w-2.5 inline" />}
                                        </Badge>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
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
