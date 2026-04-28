import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, addMonths, subMonths, isToday, isSameMonth,
} from "date-fns";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Users, Star, Phone, ArrowLeftRight } from "lucide-react";
import { useTranslation } from "@/i18n/useTranslation";
import { formatLocale } from "@/i18n/dateLocale";

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

  const shiftLabels: Record<string, string> = {
    morning: t("shift.morning"), evening: t("shift.evening"), night: t("shift.night"),
  };

  const dayHeaders = [
    t("calendar.sun"), t("calendar.mon"), t("calendar.tue"),
    t("calendar.wed"), t("calendar.thu"), t("calendar.fri"), t("calendar.sat"),
  ];

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const allDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const { data: shifts = [] } = useQuery({
    queryKey: ["global-team-shifts", format(calendarStart, "yyyy-MM-dd"), format(calendarEnd, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*, assigned_profile:assigned_user_id(full_name, is_responsible), manager_profile:manager_on_duty_id(full_name)")
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" />
          {t("page.teamCalendar")}
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>
            {t("calendar.thisMonth")}
          </Button>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
            <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-center">
            {formatLocale(currentMonth, "MMMM yyyy", locale)}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-2">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {dayHeaders.map((d, i) => (
                  <th key={i} className="p-1.5 text-center font-medium text-muted-foreground text-xs border-b min-w-[140px]">
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
                    const inMonth = isSameMonth(day, currentMonth);
                    const today = isToday(day);
                    return (
                      <td
                        key={dateStr}
                        className={`p-1 border-s align-top h-[130px] ${!inMonth ? "bg-muted/30" : ""} ${today ? "ring-2 ring-inset ring-primary/40" : ""}`}
                      >
                        <div className={`text-xs font-medium mb-1 ${!inMonth ? "text-muted-foreground/50" : today ? "text-primary font-bold" : "text-muted-foreground"}`}>
                          {format(day, "d")}
                        </div>
                        {inMonth && (
                          <div className="space-y-0.5">
                            {shiftTypes.map((type) => {
                              const typeShifts = getShifts(dateStr, type);
                              if (typeShifts.length === 0) return null;
                              return (
                                <div key={type} className={`rounded border px-1 py-0.5 ${shiftColors[type]}`}>
                                  <div className={`text-[9px] font-semibold ${shiftTextColors[type]} flex items-center gap-0.5`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${shiftDotColors[type]}`} />
                                    {shiftLabels[type]}
                                  </div>
                                  <div className="flex flex-wrap gap-x-1">
                                    {typeShifts.map((s) => {
                                      const profile = s.assigned_profile as any;
                                      const isStandby = s.is_standby;
                                      const isExternal = (s as any).is_external;
                                      const isResp = s.is_responsible_on_shift || profile?.is_responsible;
                                      const firstName = profile?.full_name?.split(" ")[0] || "?";
                                      return (
                                        <span key={s.id} className={`text-[10px] leading-tight inline-flex items-center ${isStandby ? "opacity-70" : ""} ${isResp ? "font-bold" : ""}`}>
                                          {isExternal && <ArrowLeftRight className="me-0.5 h-2.5 w-2.5 inline" />}
                                          {firstName}
                                          {isResp && <Star className="ms-0.5 h-2.5 w-2.5 inline fill-current" />}
                                          {isStandby && <Phone className="ms-0.5 h-2.5 w-2.5 inline text-blue-500" />}
                                        </span>
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
          <Star className="h-2.5 w-2.5" />
          <span>{t("calendar.responsible")}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="italic opacity-50 text-[11px]">{t("common.name")} OC</span>
          <span>{t("calendar.onCall")}</span>
        </div>
      </div>
    </div>
  );
}
