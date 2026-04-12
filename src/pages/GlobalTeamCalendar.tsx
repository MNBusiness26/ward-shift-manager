import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, addDays, startOfWeek, endOfWeek } from "date-fns";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";

const shiftTypeColors: Record<string, string> = {
  morning: "bg-yellow-100 text-yellow-800 border-yellow-200",
  evening: "bg-orange-100 text-orange-800 border-orange-200",
  night: "bg-indigo-100 text-indigo-800 border-indigo-200",
};

export default function GlobalTeamCalendar() {
  const [weekOffset, setWeekOffset] = useState(0);
  const today = new Date();
  const weekStart = startOfWeek(addDays(today, weekOffset * 7), { weekStartsOn: 0 });
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const { data: shifts = [] } = useQuery({
    queryKey: ["global-team-shifts", format(weekStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*, assigned_profile:assigned_user_id(full_name, is_responsible), manager_profile:manager_on_duty_id(full_name)")
        .eq("is_draft", false)
        .gte("date", format(weekStart, "yyyy-MM-dd"))
        .lte("date", format(weekEnd, "yyyy-MM-dd"))
        .order("date")
        .order("start_time");
      if (error) throw error;
      return data;
    },
  });

  const shiftsByDate = (dateStr: string) =>
    shifts.filter((s) => s.date === dateStr);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" />
          Team Calendar
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekOffset((o) => o - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)}>
            This Week
          </Button>
          <Button variant="outline" size="icon" onClick={() => setWeekOffset((o) => o + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {format(weekStart, "MMM d")} — {format(weekEnd, "MMM d, yyyy")}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const dayShifts = shiftsByDate(dateStr);
          const isToday = format(day, "yyyy-MM-dd") === format(today, "yyyy-MM-dd");

          return (
            <Card key={dateStr} className={isToday ? "border-primary" : ""}>
              <CardHeader className="py-2 px-3">
                <CardTitle className={`text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                  {format(day, "EEE, MMM d")}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0 space-y-1.5">
                {dayShifts.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic">No shifts</p>
                ) : (
                  dayShifts.map((shift) => {
                    const profile = shift.assigned_profile as any;
                    const manager = shift.manager_profile as any;
                    return (
                      <div
                        key={shift.id}
                        className={`rounded border p-1.5 text-[11px] ${shift.is_standby ? "border-dashed bg-transparent" : shiftTypeColors[shift.type] || ""}`}
                      >
                        <div className="flex items-center gap-1 font-medium">
                          {shift.is_standby && <span className="text-[10px] font-bold">S</span>}
                          <span>{profile?.full_name || "Unassigned"}</span>
                        </div>
                        <div className="text-[10px] opacity-80">
                          {shift.type} · {shift.start_time?.slice(0, 5)}–{shift.end_time?.slice(0, 5)}
                        </div>
                        {profile?.is_responsible && (
                          <Badge variant="outline" className="text-[9px] h-4 px-1 mt-0.5">
                            Responsible
                          </Badge>
                        )}
                        {shift.is_responsible_on_shift && !profile?.is_responsible && (
                          <Badge variant="outline" className="text-[9px] h-4 px-1 mt-0.5">
                            Resp. on shift
                          </Badge>
                        )}
                        {manager?.full_name && (
                          <div className="text-[10px] opacity-70 mt-0.5">
                            MOD: {manager.full_name}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
