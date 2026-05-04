import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Sun, Sunset, Moon, Users, ArrowLeftRight, Ban, Palmtree, Plane, Star, Bandage, Baby } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, addDays, startOfToday, isSameDay } from "date-fns";
import { formatLocale } from "@/i18n/dateLocale";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useTranslation } from "@/i18n/useTranslation";
import { getRoleLabel } from "@/lib/roles";

const shiftIcons: Record<string, React.ElementType> = {
  morning: Sun,
  evening: Sunset,
  night: Moon,
};

const shiftColorClass: Record<string, { bg: string; border: string; icon: string }> = {
  morning: {
    bg: "bg-shift-morning/10",
    border: "border-s-2 border-s-shift-morning",
    icon: "text-shift-morning",
  },
  evening: {
    bg: "bg-shift-evening/10",
    border: "border-s-2 border-s-shift-evening",
    icon: "text-shift-evening",
  },
  night: {
    bg: "bg-shift-night/10",
    border: "border-s-2 border-s-shift-night",
    icon: "text-shift-night",
  },
};

export default function Index() {
  const { user, profile, roles } = useAuth();
  const { settings } = useAppSettings();
  const { t, locale } = useTranslation();
  const today = startOfToday();
  const weekEnd = addDays(today, 6);
  const todayStr = format(today, "yyyy-MM-dd");
  const endStr = format(weekEnd, "yyyy-MM-dd");

  const greetingTemplate = settings.find((s: any) => s.key === "greeting_template")?.value as string | undefined;
  const greetingFormat = settings.find((s: any) => s.key === "greeting_format")?.value ?? "formal";

  const roleLabel = (() => {
    if (roles.includes("manager")) return "Manager";
    if (roles.includes("assistant_manager")) return "Assistant Manager";
    if (roles.includes("assistant")) return "Assistant";
    return "Nurse";
  })();

  const shiftLabels: Record<string, string> = {
    morning: t("shift.morning"),
    evening: t("shift.evening"),
    night: t("shift.night"),
  };

  const greeting = (() => {
    const name = profile?.full_name || "there";
    const firstName = name.split(" ")[0];
    const lastName = name.split(" ").slice(1).join(" ") || firstName;
    if (greetingTemplate && typeof greetingTemplate === "string" && greetingTemplate.trim()) {
      return greetingTemplate
        .replace(/\{\{title\}\}/g, roleLabel)
        .replace(/\{\{first_name\}\}/g, firstName)
        .replace(/\{\{last_name\}\}/g, lastName);
    }
    if (greetingFormat === "first_name") {
      return `${t("dashboard.greeting")}, ${firstName}`;
    }
    return `${t("dashboard.greeting")}, ${roleLabel} ${name}`;
  })();

  const { data: myShifts = [], isLoading } = useQuery({
    queryKey: ["dashboard-my-shifts", user?.id, todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*, profiles:assigned_user_id(full_name)")
        .eq("assigned_user_id", user!.id)
        .eq("is_draft", false)
        .gte("date", todayStr)
        .lte("date", endStr)
        .order("date")
        .order("start_time");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: allShifts = [] } = useQuery({
    queryKey: ["dashboard-all-shifts", todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("id, date, type, assigned_user_id, is_responsible_on_shift, is_draft, profiles:assigned_user_id(full_name)")
        .eq("is_draft", false)
        .gte("date", todayStr)
        .lte("date", endStr);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: swaps = [] } = useQuery({
    queryKey: ["dashboard-swaps", user?.id, todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("swap_requests")
        .select("*, shift:shift_id(date, type, start_time, end_time)")
        .or(`requesting_user_id.eq.${user!.id},covering_user_id.eq.${user!.id}`)
        .in("status", ["pending", "peer_accepted"]);
      if (error) throw error;
      return (data || []).filter((s: any) => {
        const d = s.shift?.date;
        return d && d >= todayStr && d <= endStr;
      });
    },
    enabled: !!user,
  });

  const { data: absences = [] } = useQuery({
    queryKey: ["dashboard-absences", user?.id, todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_requests")
        .select("*")
        .eq("user_id", user!.id)
        .eq("status", "approved")
        .lte("date", endStr)
        .or(`end_date.gte.${todayStr},end_date.is.null`);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  const getTeammates = (date: string, type: string) =>
    allShifts.filter(
      (s) => s.date === date && s.type === type && s.assigned_user_id !== user?.id
    );

  const getAbsenceForDate = (dateStr: string) =>
    absences.find((a: any) => {
      const end = a.end_date || a.date;
      return dateStr >= a.date && dateStr <= end;
    });

  const getSwapsForDate = (dateStr: string) =>
    swaps.filter((s: any) => s.shift?.date === dateStr);

  // Ward Pulse logic: compute staffing status for each day
  const getWardPulse = (dateStr: string, dayShifts: any[], daySwaps: any[]) => {
    // Green = has shifts and no pending swaps, Red = no shifts for the day, Amber = pending swaps
    if (daySwaps.length > 0) return "amber";
    if (dayShifts.length > 0) return "green";
    return "neutral";
  };

  const pulseColors: Record<string, string> = {
    green: "bg-success",
    amber: "bg-shift-morning",
    red: "bg-destructive",
    neutral: "bg-border",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">{greeting}</h1>
        <p className="text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse shadow-md">
              <CardContent className="h-20 p-4" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {days.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const isToday = isSameDay(day, new Date());
            const dayShifts = myShifts.filter((s) => s.date === dateStr);
            const absence = getAbsenceForDate(dateStr);
            const daySwaps = getSwapsForDate(dateStr);
            const hasContent = dayShifts.length > 0 || absence || daySwaps.length > 0;
            const pulse = getWardPulse(dateStr, dayShifts, daySwaps);

            return (
              <div key={dateStr} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h2 className={`text-sm font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {formatLocale(day, "EEEE, MMMM d", locale)}
                  </h2>
                  {isToday && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
                      {t("dashboard.today")}
                    </Badge>
                  )}
                </div>

                {!hasContent ? (
                  <Card className="border-dashed shadow-md">
                    <CardContent className="flex items-center gap-3 py-4 px-4">
                      <Calendar className="h-4 w-4 text-muted-foreground/50" />
                      <span className="text-sm text-muted-foreground">{t("dashboard.noShifts")}</span>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {absence && dayShifts.length === 0 && (
                      <Card className="border-muted bg-muted/30 shadow-md">
                        <CardContent className="flex items-center gap-3 py-4 px-4">
                          {absence.request_type === "vacation" || absence.request_type === "yearly_leave" ? (
                            <Palmtree className="h-5 w-5 text-muted-foreground" />
                          ) : absence.request_type === "sick_leave" ? (
                            <Bandage className="h-5 w-5 text-muted-foreground" />
                          ) : absence.request_type === "maternity_leave" ? (
                            <Baby className="h-5 w-5 text-muted-foreground" />
                          ) : absence.request_type === "leave" ? (
                            <Plane className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <Ban className="h-5 w-5 text-muted-foreground" />
                          )}
                          <div>
                            <span className="text-sm font-medium capitalize">
                              {(() => {
                                switch (absence.request_type) {
                                  case "vacation": return t("dashboard.vacation");
                                  case "leave": return t("dashboard.leave");
                                  case "sick_leave": return t("dashboard.sickLeave");
                                  case "maternity_leave": return t("dashboard.maternityLeave");
                                  case "yearly_leave": return t("dashboard.yearlyLeave");
                                  default: return t("dashboard.blocked");
                                }
                              })()}
                            </span>
                            <span className="text-sm text-muted-foreground ms-1.5">— {t("dashboard.allDay")}</span>
                          </div>
                          {absence.reason && (
                            <span className="text-xs text-muted-foreground ms-auto hidden sm:inline">
                              {absence.reason}
                            </span>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {dayShifts.map((shift) => {
                      const Icon = shiftIcons[shift.type] || Sun;
                      const colors = shiftColorClass[shift.type] || shiftColorClass.morning;
                      const teammates = getTeammates(dateStr, shift.type);
                      const hasSwap = daySwaps.some((sw: any) => sw.shift_id === shift.id);

                      return (
                        <Card
                          key={shift.id}
                          className={`overflow-hidden shadow-md border-0 ${isToday ? "ring-1 ring-primary/20" : ""}`}
                        >
                          {/* Ward Pulse strip */}
                          <div className={`h-1 ${pulseColors[hasSwap ? "amber" : "green"]}`} />
                          <CardContent className="p-0">
                            <div className={`${colors.bg} ${colors.border} ${shift.is_draft ? "border-dashed" : ""}`}>
                              <div className="relative flex-1 p-3 md:p-4 space-y-2">
                                {/* Responsible star top-right */}
                                {shift.is_responsible_on_shift && (
                                  <Star className="absolute top-3 end-3 h-4 w-4 fill-primary text-primary" />
                                )}

                                <div className="flex items-center gap-2 flex-wrap pe-6">
                                  <Icon className={`h-4 w-4 ${colors.icon}`} />
                                  <span className={`text-sm font-semibold ${colors.icon}`}>
                                    {shiftLabels[shift.type]}
                                  </span>
                                  <span className="text-sm text-muted-foreground">
                                    {shift.start_time.slice(0, 5)} — {shift.end_time.slice(0, 5)}
                                  </span>
                                  {shift.is_draft && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 opacity-60">{t("dashboard.draft")}</Badge>
                                  )}
                                  {hasSwap && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-shift-morning/30 text-shift-morning">
                                      <ArrowLeftRight className="h-2.5 w-2.5 me-0.5" />
                                      {t("dashboard.pendingSwap")}
                                    </Badge>
                                  )}
                                </div>

                                <div className="text-xs text-muted-foreground">
                                  {t("dashboard.role")}: <span className="font-medium text-foreground capitalize">{roleLabel}</span>
                                </div>

                                <div className="flex items-start gap-1.5 text-xs">
                                  <Users className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                                  <div className="flex-1">
                                    <span className="text-muted-foreground font-medium">{t("dashboard.onShiftWith")} </span>
                                    {teammates.length === 0 ? (
                                      <span className="text-muted-foreground">{t("dashboard.noOtherStaff")}</span>
                                    ) : (
                                      <span className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                                        {teammates.map((tm) => (
                                          <span key={tm.id} className="inline-flex items-center gap-0.5">
                                            {(tm.profiles as any)?.full_name?.split(" ")[0] || "?"}
                                            {tm.is_responsible_on_shift && (
                                              <Star className="h-2.5 w-2.5 fill-primary text-primary" />
                                            )}
                                          </span>
                                        ))}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {shift.comments && (
                                  <p className="text-xs text-muted-foreground border-t border-border pt-1.5 mt-1">
                                    {shift.comments}
                                  </p>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}

                    {dayShifts.length === 0 && daySwaps.length > 0 && !absence && (
                      <Card className="border-dashed shadow-md">
                        <CardContent className="flex items-center gap-3 py-4 px-4">
                          <ArrowLeftRight className="h-4 w-4 text-shift-morning" />
                          <span className="text-sm text-muted-foreground">
                            {daySwaps.length} {t("dashboard.pendingSwaps")}
                          </span>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
