import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { BarChart3 } from "lucide-react";

export default function Analytics() {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const { data: staff = [] } = useQuery({
    queryKey: ["analytics-staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, target_fte_percent, is_active")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: shifts = [] } = useQuery({
    queryKey: ["analytics-shifts", format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .eq("is_draft", false)
        .gte("date", format(monthStart, "yyyy-MM-dd"))
        .lte("date", format(monthEnd, "yyyy-MM-dd"));
      if (error) throw error;
      return data;
    },
  });

  const staffStats = staff.map((member) => {
    const memberShifts = shifts.filter((s) => s.assigned_user_id === member.id);
    const morning = memberShifts.filter((s) => s.type === "morning").length;
    const evening = memberShifts.filter((s) => s.type === "evening").length;
    const night = memberShifts.filter((s) => s.type === "night").length;
    const total = memberShifts.length;

    // Weekly fulfillment based on current week
    const weekStart = startOfWeek(now);
    const weekEnd = endOfWeek(now);
    const weekShifts = memberShifts.filter((s) => {
      const d = new Date(s.date);
      return d >= weekStart && d <= weekEnd;
    });
    const expected = 5 * (member.target_fte_percent ?? 1);
    const fulfillment = expected > 0 ? Math.round((weekShifts.length / expected) * 100) : 0;

    return { ...member, morning, evening, night, total, fulfillment };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>
      <p className="text-muted-foreground">{format(now, "MMMM yyyy")} — Staff performance overview</p>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">{staff.length}</p>
            <p className="text-sm text-muted-foreground">Active Staff</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">{shifts.length}</p>
            <p className="text-sm text-muted-foreground">Published Shifts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">
              {staffStats.length > 0
                ? Math.round(staffStats.reduce((a, s) => a + s.fulfillment, 0) / staffStats.length)
                : 0}%
            </p>
            <p className="text-sm text-muted-foreground">Avg Fulfillment</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4" />
            Staff Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {staffStats.map((s) => (
              <div key={s.id} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{s.full_name}</span>
                  <span className="text-muted-foreground">
                    {s.total} shifts · M:{s.morning} E:{s.evening} N:{s.night}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={Math.min(s.fulfillment, 100)} className="h-2 flex-1" />
                  <span className="text-xs font-medium w-10 text-right">{s.fulfillment}%</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
