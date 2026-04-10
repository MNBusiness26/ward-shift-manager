import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Sun, Sunset, Moon, TrendingUp, ArrowLeftRight, CalendarOff,
  Calendar, Users, Star,
} from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays } from "date-fns";

export default function StaffStats() {
  const [selectedId, setSelectedId] = useState<string>("");
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 0 });
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  // All active staff
  const { data: staff = [] } = useQuery({
    queryKey: ["staff-stats-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, target_fte_percent, is_responsible, constraints, is_active")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: staffRoles = [] } = useQuery({
    queryKey: ["staff-stats-roles", selectedId],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", selectedId);
      return data?.map((r) => r.role) ?? [];
    },
    enabled: !!selectedId,
  });

  const selectedProfile = staff.find((s) => s.id === selectedId);

  // Month shifts
  const { data: monthShifts = [] } = useQuery({
    queryKey: ["staff-stats-month", selectedId, format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .eq("assigned_user_id", selectedId)
        .gte("date", format(monthStart, "yyyy-MM-dd"))
        .lte("date", format(monthEnd, "yyyy-MM-dd"))
        .order("date");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedId,
  });

  // Week shifts
  const { data: weekShifts = [] } = useQuery({
    queryKey: ["staff-stats-week", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .eq("assigned_user_id", selectedId)
        .gte("date", format(weekStart, "yyyy-MM-dd"))
        .lte("date", format(weekEnd, "yyyy-MM-dd"))
        .order("date");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedId,
  });

  // Swap requests
  const { data: swapRequests = [] } = useQuery({
    queryKey: ["staff-stats-swaps", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("swap_requests")
        .select("*, shift:shifts(date, type, start_time, end_time), covering_profile:profiles!swap_requests_covering_user_id_fkey(full_name)")
        .or(`requesting_user_id.eq.${selectedId},covering_user_id.eq.${selectedId}`)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedId,
  });

  // Availability requests
  const { data: availRequests = [] } = useQuery({
    queryKey: ["staff-stats-avail", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_requests")
        .select("*")
        .eq("user_id", selectedId)
        .order("date", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedId,
  });

  // Upcoming shifts (agenda)
  const { data: upcoming = [] } = useQuery({
    queryKey: ["staff-stats-agenda", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .eq("assigned_user_id", selectedId)
        .gte("date", format(now, "yyyy-MM-dd"))
        .lte("date", format(addDays(now, 14), "yyyy-MM-dd"))
        .order("date")
        .order("start_time");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedId,
  });

  const fte = selectedProfile?.target_fte_percent ?? 1;
  const expectedWeekly = 5 * fte;
  const fulfillment = expectedWeekly > 0 ? Math.round((weekShifts.length / expectedWeekly) * 100) : 0;

  const morningCount = monthShifts.filter((s) => s.type === "morning").length;
  const eveningCount = monthShifts.filter((s) => s.type === "evening").length;
  const nightCount = monthShifts.filter((s) => s.type === "night").length;
  const completedShifts = monthShifts.filter((s) => new Date(s.date) < now).length;

  const shiftLabel: Record<string, string> = { morning: "Morning", evening: "Evening", night: "Night" };
  const statusColor: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
    peer_accepted: "bg-blue-100 text-blue-800 border-blue-200",
    manager_approved: "bg-green-100 text-green-800 border-green-200",
    denied: "bg-red-100 text-red-800 border-red-200",
    approved: "bg-green-100 text-green-800 border-green-200",
    declined: "bg-red-100 text-red-800 border-red-200",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Staff Stats</h1>
      </div>

      {/* Staff selector */}
      <Select value={selectedId} onValueChange={setSelectedId}>
        <SelectTrigger className="w-full sm:w-80">
          <SelectValue placeholder="Select a staff member…" />
        </SelectTrigger>
        <SelectContent>
          {staff.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.full_name || "Unnamed"}
              {s.is_responsible && " ★"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!selectedId && (
        <div className="flex flex-col items-center py-12 text-muted-foreground">
          <Users className="h-10 w-10 mb-2 opacity-40" />
          <p className="text-sm">Select a staff member to view their stats.</p>
        </div>
      )}

      {selectedId && selectedProfile && (
        <>
          {/* Profile summary */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-lg font-semibold">{selectedProfile.full_name}</span>
                {staffRoles.map((r) => (
                  <Badge key={r} variant="outline" className="capitalize">{r}</Badge>
                ))}
                <span className="text-sm text-muted-foreground">
                  {(fte * 100).toFixed(0)}% FTE
                </span>
                {selectedProfile.is_responsible && (
                  <Badge className="gap-1">
                    <Star className="h-3 w-3 fill-current" /> Resp. Nurse
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Fulfillment */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4" /> Weekly Fulfillment
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {format(weekStart, "MMM d")} — {format(weekEnd, "MMM d")}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {weekShifts.length} of {expectedWeekly} shifts
                  </span>
                  <span className="font-semibold">{fulfillment}%</span>
                </div>
                <Progress value={Math.min(fulfillment, 100)} className="h-3" />
              </div>
            </CardContent>
          </Card>

          {/* Monthly breakdown */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-shift-morning/15">
                  <Sun className="h-5 w-5 text-shift-morning" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{morningCount}</p>
                  <p className="text-xs text-muted-foreground">Morning</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-shift-evening/15">
                  <Sunset className="h-5 w-5 text-shift-evening" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{eveningCount}</p>
                  <p className="text-xs text-muted-foreground">Evening</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-shift-night/15">
                  <Moon className="h-5 w-5 text-shift-night" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{nightCount}</p>
                  <p className="text-xs text-muted-foreground">Night</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Month summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Month Summary — {format(now, "MMMM yyyy")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border p-4 text-center">
                  <p className="text-3xl font-bold">{monthShifts.length}</p>
                  <p className="text-sm text-muted-foreground">Total Booked</p>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <p className="text-3xl font-bold">{completedShifts}</p>
                  <p className="text-sm text-muted-foreground">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Upcoming agenda */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-4 w-4" /> Upcoming Agenda (14 days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming shifts.</p>
              ) : (
                <div className="space-y-2">
                  {upcoming.map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{format(new Date(s.date), "EEE, MMM d")}</span>
                        <Badge variant="outline" className="capitalize text-xs">{shiftLabel[s.type] || s.type}</Badge>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {s.start_time.slice(0, 5)} — {s.end_time.slice(0, 5)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Swap requests */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowLeftRight className="h-4 w-4" /> Swap Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              {swapRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No swap requests.</p>
              ) : (
                <div className="space-y-2">
                  {swapRequests.map((sr) => {
                    const shift = sr.shift as any;
                    const coveringProfile = sr.covering_profile as any;
                    return (
                      <div key={sr.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div className="text-sm">
                          <span className="font-medium">
                            {shift?.date ? format(new Date(shift.date), "MMM d") : "—"}
                          </span>
                          {shift && (
                            <span className="ml-2 text-muted-foreground capitalize">
                              {shiftLabel[shift.type] || shift.type} {shift.start_time?.slice(0, 5)}–{shift.end_time?.slice(0, 5)}
                            </span>
                          )}
                          {!sr.is_pool_request && coveringProfile?.full_name && (
                            <span className="ml-2 text-muted-foreground">
                              with {coveringProfile.full_name}
                            </span>
                          )}
                          {sr.is_pool_request && (
                            <span className="ml-2 text-muted-foreground italic">Pool</span>
                          )}
                        </div>
                        <Badge variant="outline" className={statusColor[sr.status] || ""}>
                          {sr.status.replace("_", " ")}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Availability */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarOff className="h-4 w-4" /> Availability Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              {availRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No availability requests.</p>
              ) : (
                <div className="space-y-2">
                  {availRequests.map((ar) => (
                    <div key={ar.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="text-sm">
                        <span className="font-medium">{format(new Date(ar.date), "MMM d")}</span>
                        {ar.end_date && (
                          <span className="text-muted-foreground"> — {format(new Date(ar.end_date), "MMM d")}</span>
                        )}
                        <Badge variant="outline" className="ml-2 capitalize text-xs">{ar.request_type}</Badge>
                      </div>
                      <Badge variant="outline" className={statusColor[ar.status] || ""}>
                        {ar.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
