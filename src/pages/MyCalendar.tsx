import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sun, Sunset, Moon } from "lucide-react";
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

export default function MyCalendar() {
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

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

  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart);

  const getShiftsForDay = (day: Date) =>
    shifts.filter((s) => isSameDay(new Date(s.date), day));

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
              return (
                <div
                  key={day.toISOString()}
                  className={`h-16 md:h-20 rounded-md border p-1 text-xs hover:bg-accent/50 cursor-pointer transition-colors ${
                    isSameDay(day, new Date()) ? "bg-primary/5 border-primary/30" : ""
                  }`}
                  onClick={() => dayShifts.length > 0 && setSelectedShift(dayShifts[0])}
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

      <Dialog open={!!selectedShift} onOpenChange={() => setSelectedShift(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Shift Details</DialogTitle>
          </DialogHeader>
          {selectedShift && (() => {
            const Icon = shiftIcons[selectedShift.type];
            return (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5" />
                  <span className="font-medium capitalize">{selectedShift.type} Shift</span>
                </div>
                <div className="text-sm space-y-1">
                  <p><span className="text-muted-foreground">Date:</span> {format(new Date(selectedShift.date), "EEEE, MMMM d, yyyy")}</p>
                  <p><span className="text-muted-foreground">Time:</span> {selectedShift.start_time.slice(0, 5)} — {selectedShift.end_time.slice(0, 5)}</p>
                  {selectedShift.is_responsible_on_shift && (
                    <Badge className="mt-2">Responsible Nurse</Badge>
                  )}
                  {selectedShift.comments && (
                    <p className="mt-2 text-muted-foreground">{selectedShift.comments}</p>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
