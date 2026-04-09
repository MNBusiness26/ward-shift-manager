import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths, eachWeekOfInterval } from "date-fns";
import { BarChart3, Users, Calendar, TrendingUp, Sun, Sunset, Moon } from "lucide-react";
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const SHIFT_COLORS = {
  morning: "hsl(35, 90%, 55%)",
  evening: "hsl(270, 60%, 55%)",
  night: "hsl(220, 60%, 35%)",
};

export default function Analytics() {
  const now = new Date();
  const [monthOffset, setMonthOffset] = useState(0);
  const selectedMonth = subMonths(now, monthOffset);
  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(selectedMonth);

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

  // Staff stats
  const staffStats = staff.map((member) => {
    const memberShifts = shifts.filter((s) => s.assigned_user_id === member.id);
    const morning = memberShifts.filter((s) => s.type === "morning").length;
    const evening = memberShifts.filter((s) => s.type === "evening").length;
    const night = memberShifts.filter((s) => s.type === "night").length;
    const total = memberShifts.length;
    const responsible = memberShifts.filter((s) => s.is_responsible_on_shift).length;

    const weeksInMonth = eachWeekOfInterval({ start: monthStart, end: monthEnd }).length;
    const expectedTotal = Math.round(5 * (member.target_fte_percent ?? 1) * weeksInMonth);
    const fulfillment = expectedTotal > 0 ? Math.round((total / expectedTotal) * 100) : 0;

    return { ...member, morning, evening, night, total, responsible, fulfillment, expectedTotal };
  });

  // Aggregate charts
  const shiftTypeData = [
    { name: "Morning", value: shifts.filter((s) => s.type === "morning").length, color: SHIFT_COLORS.morning },
    { name: "Evening", value: shifts.filter((s) => s.type === "evening").length, color: SHIFT_COLORS.evening },
    { name: "Night", value: shifts.filter((s) => s.type === "night").length, color: SHIFT_COLORS.night },
  ];

  // Weekly distribution
  const weeks = eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 0 });
  const weeklyData = weeks.map((weekStart) => {
    const we = endOfWeek(weekStart, { weekStartsOn: 0 });
    const weekShifts = shifts.filter((s) => {
      const d = new Date(s.date);
      return d >= weekStart && d <= we;
    });
    return {
      week: format(weekStart, "MMM d"),
      morning: weekShifts.filter((s) => s.type === "morning").length,
      evening: weekShifts.filter((s) => s.type === "evening").length,
      night: weekShifts.filter((s) => s.type === "night").length,
    };
  });

  const avgFulfillment = staffStats.length > 0
    ? Math.round(staffStats.reduce((a, s) => a + s.fulfillment, 0) / staffStats.length)
    : 0;

  const shiftsWithoutRN = shifts.filter((s) => !s.is_responsible_on_shift).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <Select value={String(monthOffset)} onValueChange={(v) => setMonthOffset(Number(v))}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <SelectItem key={i} value={String(i)}>
                {format(subMonths(now, i), "MMMM yyyy")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2"><Users className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-2xl font-bold">{staff.length}</p>
                <p className="text-xs text-muted-foreground">Active Staff</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-shift-morning/10 p-2"><Calendar className="h-5 w-5 text-shift-morning" /></div>
              <div>
                <p className="text-2xl font-bold">{shifts.length}</p>
                <p className="text-xs text-muted-foreground">Published Shifts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-100 p-2"><TrendingUp className="h-5 w-5 text-green-600" /></div>
              <div>
                <p className="text-2xl font-bold">{avgFulfillment}%</p>
                <p className="text-xs text-muted-foreground">Avg Fulfillment</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-destructive/10 p-2"><BarChart3 className="h-5 w-5 text-destructive" /></div>
              <div>
                <p className="text-2xl font-bold">{shiftsWithoutRN}</p>
                <p className="text-xs text-muted-foreground">Missing RN</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Weekly Shift Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="week" className="text-xs" tick={{ fontSize: 11 }} />
                <YAxis className="text-xs" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="morning" stackId="a" fill={SHIFT_COLORS.morning} name="Morning" radius={[0, 0, 0, 0]} />
                <Bar dataKey="evening" stackId="a" fill={SHIFT_COLORS.evening} name="Evening" />
                <Bar dataKey="night" stackId="a" fill={SHIFT_COLORS.night} name="Night" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Shift Type Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={shiftTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={2}>
                  {shiftTypeData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Staff breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Staff Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {staffStats.sort((a, b) => b.fulfillment - a.fulfillment).map((s) => (
              <div key={s.id} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{s.full_name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({(s.target_fte_percent * 100).toFixed(0)}% FTE)
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-0.5"><Sun className="h-3 w-3 text-shift-morning" />{s.morning}</span>
                    <span className="flex items-center gap-0.5"><Sunset className="h-3 w-3 text-shift-evening" />{s.evening}</span>
                    <span className="flex items-center gap-0.5"><Moon className="h-3 w-3 text-shift-night" />{s.night}</span>
                    <span className="font-medium">{s.total}/{s.expectedTotal}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Progress
                    value={Math.min(s.fulfillment, 100)}
                    className="h-2.5 flex-1"
                  />
                  <Badge
                    variant="outline"
                    className={`text-xs w-14 justify-center ${
                      s.fulfillment >= 90
                        ? "bg-green-100 text-green-800 border-green-200"
                        : s.fulfillment >= 70
                        ? "bg-yellow-100 text-yellow-800 border-yellow-200"
                        : "bg-destructive/10 text-destructive border-destructive/20"
                    }`}
                  >
                    {s.fulfillment}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
