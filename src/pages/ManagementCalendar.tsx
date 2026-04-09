import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval } from "date-fns";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const shiftTypes = ["morning", "evening", "night"] as const;

const shiftLabels: Record<string, string> = {
  morning: "Morning",
  evening: "Evening",
  night: "Night",
};

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

export default function ManagementCalendar() {
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const { data: shifts = [] } = useQuery({
    queryKey: ["mgmt-calendar-shifts", format(weekStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*, profiles:assigned_user_id(full_name)")
        .gte("date", format(weekStart, "yyyy-MM-dd"))
        .lte("date", format(weekEnd, "yyyy-MM-dd"))
        .eq("is_draft", false)
        .order("date")
        .order("start_time");
      if (error) throw error;
      return data;
    },
  });

  const getFirstName = (shift: any): string => {
    const fullName = shift.profiles?.full_name;
    if (!fullName) return "?";
    return fullName.split(" ")[0];
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Management Calendar</h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <Button variant="ghost" size="icon" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <CardTitle className="text-base">
            {format(weekStart, "MMM d")} — {format(weekEnd, "MMM d, yyyy")}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card p-2 text-left font-medium text-muted-foreground min-w-[90px] border-b">
                  Shift
                </th>
                {days.map((d) => (
                  <th key={d.toISOString()} className="min-w-[140px] p-2 text-center font-medium text-muted-foreground border-b">
                    <div>{format(d, "EEE")}</div>
                    <div className="text-xs">{format(d, "MMM d")}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shiftTypes.map((type) => (
                <tr key={type} className="border-t">
                  <td className={`sticky left-0 z-10 bg-card p-2 font-semibold ${shiftTextColors[type]}`}>
                    {shiftLabels[type]}
                  </td>
                  {days.map((d) => {
                    const dateStr = format(d, "yyyy-MM-dd");
                    const dayShifts = shifts.filter(
                      (s) => s.date === dateStr && s.type === type && s.assigned_user_id
                    );
                    return (
                      <td
                        key={d.toISOString()}
                        className={`p-2 border-l align-top ${shiftColors[type]}`}
                      >
                        {dayShifts.length === 0 ? (
                          <span className="text-xs text-muted-foreground italic">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {dayShifts.map((s) => (
                              <Badge
                                key={s.id}
                                variant={s.is_responsible_on_shift ? "default" : "secondary"}
                                className={`text-xs ${s.is_responsible_on_shift ? "font-bold" : "font-normal"}`}
                              >
                                {getFirstName(s)}
                                {s.is_responsible_on_shift && (
                                  <span className="ml-0.5 text-[9px]">★</span>
                                )}
                              </Badge>
                            ))}
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

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Badge variant="default" className="text-[10px] font-bold">Name ★</Badge>
          <span>Responsible Nurse</span>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="secondary" className="text-[10px]">Name</Badge>
          <span>Assigned Nurse</span>
        </div>
      </div>
    </div>
  );
}
