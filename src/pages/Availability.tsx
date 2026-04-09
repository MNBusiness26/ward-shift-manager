import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
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
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  declined: "bg-red-100 text-red-800 border-red-200",
};

export default function Availability() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [reason, setReason] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const { data: requests = [] } = useQuery({
    queryKey: ["availability-requests", user?.id, format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_requests")
        .select("*")
        .eq("user_id", user!.id)
        .gte("date", format(monthStart, "yyyy-MM-dd"))
        .lte("date", format(monthEnd, "yyyy-MM-dd"))
        .order("date");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const createRequest = useMutation({
    mutationFn: async () => {
      if (!selectedDate || !user) return;
      const { error } = await supabase.from("availability_requests").insert({
        user_id: user.id,
        date: format(selectedDate, "yyyy-MM-dd"),
        reason: reason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["availability-requests"] });
      toast.success("Availability block submitted");
      setDialogOpen(false);
      setReason("");
      setSelectedDate(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("availability_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["availability-requests"] });
      toast.success("Request removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart);
  const getRequestsForDay = (day: Date) =>
    requests.filter((r) => isSameDay(new Date(r.date), day));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Availability</h1>
      </div>

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
              const dayReqs = getRequestsForDay(day);
              const hasBlock = dayReqs.length > 0;
              return (
                <div
                  key={day.toISOString()}
                  onClick={() => {
                    if (!hasBlock) {
                      setSelectedDate(day);
                      setDialogOpen(true);
                    }
                  }}
                  className={`h-16 md:h-20 rounded-md border p-1 text-xs cursor-pointer transition-colors ${
                    hasBlock
                      ? dayReqs[0].status === "approved"
                        ? "bg-destructive/10 border-destructive/30"
                        : "bg-yellow-50 border-yellow-200"
                      : "hover:bg-accent/50"
                  }`}
                >
                  <span className="text-muted-foreground">{format(day, "d")}</span>
                  {dayReqs.map((r) => (
                    <Badge key={r.id} variant="outline" className={`mt-1 text-[10px] ${statusColors[r.status]}`}>
                      {r.status}
                    </Badge>
                  ))}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Pending requests list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No availability blocks this month.</p>
          ) : (
            <div className="space-y-2">
              {requests.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{format(new Date(r.date), "EEE, MMM d")}</p>
                    {r.reason && <p className="text-xs text-muted-foreground">{r.reason}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={statusColors[r.status]}>{r.status}</Badge>
                    {r.status === "pending" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => deleteRequest.mutate(r.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Block date dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block Date</DialogTitle>
          </DialogHeader>
          {selectedDate && (
            <div className="space-y-4">
              <p className="text-sm">
                Block <strong>{format(selectedDate, "EEEE, MMMM d, yyyy")}</strong> from scheduling?
              </p>
              <Input
                placeholder="Reason (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => createRequest.mutate()} disabled={createRequest.isPending}>
                  Submit Request
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
