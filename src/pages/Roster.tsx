import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval } from "date-fns";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const shiftBg: Record<string, string> = {
  morning: "bg-shift-morning/20 border-shift-morning/40",
  evening: "bg-shift-evening/20 border-shift-evening/40",
  night: "bg-shift-night/20 border-shift-night/40",
};

export default function Roster() {
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const weekEnd = endOfWeek(weekStart);
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const { data: shifts = [] } = useQuery({
    queryKey: ["roster-shifts", format(weekStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*, profiles:assigned_user_id(full_name)")
        .gte("date", format(weekStart, "yyyy-MM-dd"))
        .lte("date", format(weekEnd, "yyyy-MM-dd"))
        .order("date")
        .order("start_time");
      if (error) throw error;
      return data;
    },
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["all-staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, is_active")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const publishDrafts = useMutation({
    mutationFn: async () => {
      const draftIds = shifts.filter((s) => s.is_draft).map((s) => s.id);
      if (draftIds.length === 0) return;
      const { error } = await supabase
        .from("shifts")
        .update({ is_draft: false })
        .in("id", draftIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster-shifts"] });
      toast.success("Schedule published!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const draftCount = shifts.filter((s) => s.is_draft).length;
  const missingResponsible = shifts.filter((s) => !s.is_responsible_on_shift && !s.is_draft);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Master Roster</h1>
        <div className="flex items-center gap-2">
          {draftCount > 0 && (
            <Button onClick={() => publishDrafts.mutate()} disabled={publishDrafts.isPending}>
              <Eye className="mr-2 h-4 w-4" />
              Publish {draftCount} Draft{draftCount > 1 ? "s" : ""}
            </Button>
          )}
        </div>
      </div>

      {missingResponsible.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <span>{missingResponsible.length} published shift(s) missing a Responsible Nurse</span>
        </div>
      )}

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
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 bg-card p-2 text-left font-medium text-muted-foreground">Staff</th>
                {days.map((d) => (
                  <th key={d.toISOString()} className="min-w-[100px] p-2 text-center font-medium text-muted-foreground">
                    {format(d, "EEE d")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.id} className="border-t">
                  <td className="sticky left-0 bg-card p-2 font-medium">
                    <div className="flex items-center gap-2">
                      <span className={!member.is_active ? "text-muted-foreground" : ""}>
                        {member.full_name}
                      </span>
                      {!member.is_active && (
                        <Badge variant="outline" className="text-[10px]">Inactive</Badge>
                      )}
                    </div>
                  </td>
                  {days.map((d) => {
                    const dayShifts = shifts.filter(
                      (s) => s.assigned_user_id === member.id && s.date === format(d, "yyyy-MM-dd")
                    );
                    return (
                      <td key={d.toISOString()} className="p-1 text-center">
                        {dayShifts.map((s) => (
                          <div
                            key={s.id}
                            className={`mb-1 rounded border px-2 py-1 text-xs ${shiftBg[s.type]} ${
                              s.is_draft ? "opacity-60 border-dashed" : ""
                            }`}
                          >
                            <span className="capitalize">{s.type.charAt(0)}</span>
                            {s.is_responsible_on_shift && (
                              <span className="ml-1 text-[10px] font-bold">RN</span>
                            )}
                            {s.is_draft && <EyeOff className="ml-1 inline h-3 w-3" />}
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
