import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Sun, Sunset, Moon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, addDays, startOfToday } from "date-fns";
import { useState } from "react";
import type { Database } from "@/integrations/supabase/types";

type Shift = Database["public"]["Tables"]["shifts"]["Row"];

const shiftIcons = {
  morning: Sun,
  evening: Sunset,
  night: Moon,
};

const shiftColors: Record<string, string> = {
  morning: "bg-shift-morning/15 text-shift-morning border-shift-morning/30",
  evening: "bg-shift-evening/15 text-shift-evening border-shift-evening/30",
  night: "bg-shift-night/15 text-shift-night border-shift-night/30",
};

export default function Index() {
  const { user, profile } = useAuth();
  const [viewMode, setViewMode] = useState<"cards" | "agenda">("cards");
  const today = startOfToday();
  const weekEnd = addDays(today, 7);

  const { data: shifts = [], isLoading } = useQuery({
    queryKey: ["my-shifts-week", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .eq("assigned_user_id", user!.id)
        .gte("date", format(today, "yyyy-MM-dd"))
        .lte("date", format(weekEnd, "yyyy-MM-dd"))
        .order("date")
        .order("start_time");
      if (error) throw error;
      return data as Shift[];
    },
    enabled: !!user,
  });

  const groupedByDate = shifts.reduce<Record<string, Shift[]>>((acc, shift) => {
    (acc[shift.date] = acc[shift.date] || []).push(shift);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Welcome, {profile?.full_name?.split(" ")[0] || "there"}
          </h1>
          <p className="text-muted-foreground">Your upcoming shifts for the next 7 days</p>
        </div>
        <div className="flex gap-1 rounded-lg border p-1">
          <button
            onClick={() => setViewMode("cards")}
            className={`rounded-md px-3 py-1 text-sm transition-colors ${
              viewMode === "cards" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            Cards
          </button>
          <button
            onClick={() => setViewMode("agenda")}
            className={`rounded-md px-3 py-1 text-sm transition-colors ${
              viewMode === "agenda" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            Agenda
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-32 p-6" />
            </Card>
          ))}
        </div>
      ) : shifts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Calendar className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="text-lg font-medium">No upcoming shifts</p>
            <p className="text-sm text-muted-foreground">
              You don't have any shifts scheduled for the next 7 days.
            </p>
          </CardContent>
        </Card>
      ) : viewMode === "cards" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {shifts.map((shift) => {
            const Icon = shiftIcons[shift.type];
            return (
              <Card key={shift.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {format(new Date(shift.date), "EEE, MMM d")}
                    </CardTitle>
                    <Badge variant="outline" className={shiftColors[shift.type]}>
                      <Icon className="mr-1 h-3 w-3" />
                      {shift.type.charAt(0).toUpperCase() + shift.type.slice(1)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {shift.start_time.slice(0, 5)} — {shift.end_time.slice(0, 5)}
                  </p>
                  {shift.is_responsible_on_shift && (
                    <Badge className="mt-2 bg-primary/10 text-primary border-primary/20" variant="outline">
                      Responsible Nurse
                    </Badge>
                  )}
                  {shift.comments && (
                    <p className="mt-2 text-xs text-muted-foreground">{shift.comments}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedByDate).map(([date, dayShifts]) => (
            <div key={date}>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                {format(new Date(date), "EEEE, MMMM d")}
              </h3>
              <div className="space-y-2">
                {dayShifts.map((shift) => {
                  const Icon = shiftIcons[shift.type];
                  return (
                    <div
                      key={shift.id}
                      className="flex items-center gap-4 rounded-lg border p-3"
                    >
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${shiftColors[shift.type]}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {shift.type.charAt(0).toUpperCase() + shift.type.slice(1)} Shift
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {shift.start_time.slice(0, 5)} — {shift.end_time.slice(0, 5)}
                        </p>
                      </div>
                      {shift.is_responsible_on_shift && (
                        <Badge variant="outline" className="text-xs">RN</Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
