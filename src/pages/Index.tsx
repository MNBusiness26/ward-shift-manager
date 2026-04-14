import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Sun, Sunset, Moon, Users, ArrowLeftRight, Ban, Palmtree, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, addDays, startOfToday, isSameDay } from "date-fns";
import { useAppSettings } from "@/hooks/useAppSettings";

const shiftIcons: Record<string, React.ElementType> = {
  morning: Sun,
  evening: Sunset,
  night: Moon,
};

const shiftBadgeColors: Record<string, string> = {
  morning: "bg-shift-morning/15 text-shift-morning border-shift-morning/30",
  evening: "bg-shift-evening/15 text-shift-evening border-shift-evening/30",
  night: "bg-shift-night/15 text-shift-night border-shift-night/30",
};

const shiftLabels: Record<string, string> = { morning: "Morning", evening: "Evening", night: "Night" };

export default function Index() {
  const { user, profile, roles } = useAuth();
  const { settings } = useAppSettings();
  const today = startOfToday();
  const weekEnd = addDays(today, 6);
  const todayStr = format(today, "yyyy-MM-dd");
  const endStr = format(weekEnd, "yyyy-MM-dd");

  // Greeting format from admin setting
  const greetingFormat = settings.find((s: any) => s.key === "greeting_format")?.value ?? "formal";

  const roleLabel = (() => {
    if (roles.includes("manager")) return "Manager";
    if (roles.includes("assistant_manager")) return "Assistant Manager";
    if (roles.includes("assistant")) return "Assistant";
    return "Nurse";
  })();

  const greeting = (() => {
    const name = profile?.full_name || "there";
    if (greetingFormat === "first_name") {
      return `Hello, ${name.split(" ")[0]}`;
    }
    return `Hello, ${roleLabel} ${name}`;
  })();

  // Personal shifts for next 7 days
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

  // All shifts in range (for teammates)
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

  // Pending/approved swaps involving user
  const { data: swaps = [] } = useQuery({
    queryKey: ["dashboard-swaps", user?.id, todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("swap_requests")
        .select("*, shift:shift_id(date, type, start_time, end_time)")
        .or(`requesting_user_id.eq.${user!.id},covering_user_id.eq.${user!.id}`)
        .in("status", ["pending", "peer_accepted"]);
      if (error) throw error;
      // Filter to shifts within 7-day window
      return (data || []).filter((s: any) => {
        const d = s.shift?.date;
        return d && d >= todayStr && d <= endStr;
      });
    },
    enabled: !!user,
  });

  // Absences (approved blocks/vacations) for user
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

  // Build 7-day agenda
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

  return (
    <div className="space-y-6">
      {/* Personalized Greeting */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold">{greeting}</h1>
        <p className="text-sm text-muted-foreground">Your next 7 days at a glance</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
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

            return (
              <div key={dateStr} className="space-y-2">
                {/* Day header */}
                <div className="flex items-center gap-2">
                  <h2 className={`text-sm font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {format(day, "EEEE, MMMM d")}
                  </h2>
                  {isToday && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
                      Today
                    </Badge>
                  )}
                </div>

                {!hasContent ? (
                  <Card className="border-dashed">
                    <CardContent className="flex items-center gap-3 py-4 px-4">
                      <Calendar className="h-4 w-4 text-muted-foreground/50" />
                      <span className="text-sm text-muted-foreground">No shifts scheduled</span>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {/* Absence card */}
                    {absence && dayShifts.length === 0 && (
                      <Card className="border-muted bg-muted/30">
                        <CardContent className="flex items-center gap-3 py-4 px-4">
                          {absence.request_type === "vacation" ? (
                            <Palmtree className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <Ban className="h-5 w-5 text-muted-foreground" />
                          )}
                          <div>
                            <span className="text-sm font-medium capitalize">
                              {absence.request_type === "vacation" ? "Vacation" : "Blocked"}
                            </span>
                            <span className="text-sm text-muted-foreground ml-1.5">— All Day</span>
                          </div>
                          {absence.reason && (
                            <span className="text-xs text-muted-foreground ml-auto hidden sm:inline">
                              {absence.reason}
                            </span>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* Shift cards */}
                    {dayShifts.map((shift) => {
                      const Icon = shiftIcons[shift.type] || Sun;
                      const teammates = getTeammates(dateStr, shift.type);
                      const hasSwap = daySwaps.some((sw: any) => sw.shift_id === shift.id);

                      return (
                        <Card
                          key={shift.id}
                          className={`overflow-hidden ${isToday ? "border-primary/30 shadow-sm" : ""}`}
                        >
                          <CardContent className="p-0">
                            <div className="flex">
                              {/* Color accent strip */}
                              <div className={`w-1.5 flex-shrink-0 ${
                                shift.type === "morning" ? "bg-shift-morning" :
                                shift.type === "evening" ? "bg-shift-evening" : "bg-shift-night"
                              }`} />

                              <div className="flex-1 p-3 md:p-4 space-y-2">
                                {/* Top row: shift type, time, badges */}
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className={`gap-1 ${shiftBadgeColors[shift.type]}`}>
                                      <Icon className="h-3 w-3" />
                                      {shiftLabels[shift.type]}
                                    </Badge>
                                    <span className="text-sm text-muted-foreground">
                                      {shift.start_time.slice(0, 5)} — {shift.end_time.slice(0, 5)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {shift.is_responsible_on_shift && (
                                      <Badge className="gap-1 text-xs">
                                        <Star className="h-3 w-3 fill-current" />
                                        Responsible
                                      </Badge>
                                    )}
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                      Published
                                    </Badge>
                                    {hasSwap && (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400/30 text-amber-600 dark:text-amber-400">
                                        <ArrowLeftRight className="h-2.5 w-2.5 mr-0.5" />
                                        Pending Swap
                                      </Badge>
                                    )}
                                  </div>
                                </div>

                                {/* Role */}
                                <div className="text-xs text-muted-foreground">
                                  Role: <span className="font-medium text-foreground capitalize">{roleLabel}</span>
                                </div>

                                {/* Teammates */}
                                <div className="flex items-start gap-1.5 text-xs">
                                  <Users className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                                  <div className="flex-1">
                                    <span className="text-muted-foreground font-medium">On shift with: </span>
                                    {teammates.length === 0 ? (
                                      <span className="text-muted-foreground">No other staff</span>
                                    ) : (
                                      <span className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                                        {teammates.map((t) => (
                                          <span key={t.id} className="inline-flex items-center gap-0.5">
                                            {(t.profiles as any)?.full_name?.split(" ")[0] || "?"}
                                            {t.is_responsible_on_shift && (
                                              <Star className="h-2.5 w-2.5 fill-primary text-primary" />
                                            )}
                                          </span>
                                        ))}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Comments */}
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

                    {/* Swap-only entries (swaps on days without own shift) */}
                    {dayShifts.length === 0 && daySwaps.length > 0 && !absence && (
                      <Card className="border-dashed">
                        <CardContent className="flex items-center gap-3 py-4 px-4">
                          <ArrowLeftRight className="h-4 w-4 text-amber-500" />
                          <span className="text-sm text-muted-foreground">
                            {daySwaps.length} pending swap{daySwaps.length > 1 ? "s" : ""} involving you
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
