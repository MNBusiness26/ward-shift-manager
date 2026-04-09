import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sun, Sunset, Moon, Star, Users } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameDay,
  addMonths,
  subMonths,
} from "date-fns";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Shift = Database["public"]["Tables"]["shifts"]["Row"];

const shiftDot: Record<string, string> = {
  morning: "bg-shift-morning",
  evening: "bg-shift-evening",
  night: "bg-shift-night",
};

const shiftIcons = { morning: Sun, evening: Sunset, night: Moon };

const shiftLabels: Record<string, string> = {
  morning: "Morning",
  evening: "Evening",
  night: "Night",
};

export default function MyCalendar() {
  const { user, profile } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  // Fetch my shifts
  const { data: shifts = [] } = useQuery({
    queryKey: ["my-shifts-month", user?.id, format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .eq("assigned_user_id", user!.id)
        .gte("date", format(monthStart, "yyyy-MM-dd"))
        .lte("date", format(monthEnd, "yyyy-MM-dd"))
        .order("date")
        .order("start_time");
      if (error) throw error;
      return data as Shift[];
    },
    enabled: !!user,
  });

  // Fetch my role
  const { data: myRoles = [] } = useQuery({
    queryKey: ["my-roles", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data.map((r) => r.role);
    },
    enabled: !!user,
  });

  // Fetch all shifts for selected day to find colleagues
  const selectedDateStr = selectedDay ? format(selectedDay, "yyyy-MM-dd") : null;
  const { data: dayAllShifts = [] } = useQuery({
    queryKey: ["day-all-shifts", selectedDateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*, profiles:shifts_assigned_user_id_fkey(full_name, is_responsible)")
        .eq("date", selectedDateStr!)
        .not("assigned_user_id", "is", null)
        .order("start_time");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedDateStr,
  });

  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart);

  const getShiftsForDay = (day: Date) =>
    shifts.filter((s) => isSameDay(new Date(s.date), day));

  // Get my shifts for selected day
  const myDayShifts = selectedDay ? getShiftsForDay(selectedDay) : [];

  // Group all shifts by type for the selected day
  const getColleaguesByShift = (shiftType: string) =>
    dayAllShifts.filter(
      (s) => s.type === shiftType && s.assigned_user_id !== user?.id
    );

  const myRole = myRoles[0] || "nurse";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Calendar</h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <CardTitle className="text-base">{format(currentMonth, "MMMM yyyy")}</CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-px text-center text-xs font-medium text-muted-foreground mb-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px">
            {Array.from({ length: startPad }).map((_, i) => (
              <div key={`pad-${i}`} className="h-16 md:h-20" />
            ))}
            {days.map((day) => {
              const dayShifts = getShiftsForDay(day);
              const isSelected = selectedDay && isSameDay(day, selectedDay);
              return (
                <div
                  key={day.toISOString()}
                  className={`h-16 md:h-20 rounded-md border p-1 text-xs hover:bg-accent/50 cursor-pointer transition-colors ${
                    isSameDay(day, new Date()) ? "bg-primary/5 border-primary/30" : ""
                  } ${isSelected ? "ring-2 ring-primary" : ""}`}
                  onClick={() => setSelectedDay(day)}
                >
                  <span className="text-muted-foreground">{format(day, "d")}</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {dayShifts.map((s) => (
                      <div
                        key={s.id}
                        className={`h-2 w-2 rounded-full ${shiftDot[s.type]}`}
                        title={`${s.type} shift`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Day Detail Dialog */}
      <Dialog open={!!selectedDay} onOpenChange={() => setSelectedDay(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedDay && format(selectedDay, "EEEE, MMMM d, yyyy")}
            </DialogTitle>
            <DialogDescription>
              Your role: <span className="capitalize font-medium text-foreground">{myRole}</span>
            </DialogDescription>
          </DialogHeader>

          {myDayShifts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No shifts scheduled for this day.</p>
          ) : (
            <div className="space-y-4">
              {myDayShifts.map((shift) => {
                const Icon = shiftIcons[shift.type];
                const colleagues = getColleaguesByShift(shift.type);
                return (
                  <div key={shift.id} className="rounded-lg border p-4 space-y-3">
                    {/* Shift info */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5" />
                        <span className="font-medium">{shiftLabels[shift.type]} Shift</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {shift.start_time.slice(0, 5)} — {shift.end_time.slice(0, 5)}
                      </span>
                    </div>

                    {/* My role on this shift */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="capitalize">{myRole}</Badge>
                      {shift.is_responsible_on_shift && (
                        <Badge className="gap-1">
                          <Star className="h-3 w-3 fill-current" />
                          Responsible Nurse
                        </Badge>
                      )}
                      {shift.is_draft && (
                        <Badge variant="outline" className="opacity-60">Draft</Badge>
                      )}
                    </div>

                    {/* Colleagues */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        Working with ({colleagues.length})
                      </div>
                      {colleagues.length === 0 ? (
                        <p className="text-xs text-muted-foreground pl-5">No other staff on this shift.</p>
                      ) : (
                        <div className="space-y-1 pl-5">
                          {colleagues.map((c) => (
                            <div key={c.id} className="flex items-center gap-2 text-sm">
                              <span>{(c as any).profiles?.full_name || "Unknown"}</span>
                              {c.is_responsible_on_shift && (
                                <Star className="h-3 w-3 fill-primary text-primary" />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {shift.comments && (
                      <p className="text-xs text-muted-foreground border-t pt-2">{shift.comments}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
