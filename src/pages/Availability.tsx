import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  isWithinInterval,
  parseISO,
} from "date-fns";
import { useState } from "react";
import { ChevronLeft, ChevronRight, X, CalendarOff, Palmtree } from "lucide-react";

const SHIFT_TYPES = ["morning", "evening", "night"] as const;

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  declined: "bg-red-100 text-red-800 border-red-200",
};

const typeIcons: Record<string, React.ReactNode> = {
  block: <CalendarOff className="h-3 w-3" />,
  vacation: <Palmtree className="h-3 w-3" />,
};

export default function Availability() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<string>("");
  const [reason, setReason] = useState("");
  const [requestType, setRequestType] = useState<"block" | "vacation">("block");
  const [blockedShifts, setBlockedShifts] = useState<string[]>([]);
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
        .or(`date.gte.${format(monthStart, "yyyy-MM-dd")},end_date.gte.${format(monthStart, "yyyy-MM-dd")}`)
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
      const startStr = format(selectedDate, "yyyy-MM-dd");
      const endStr = endDate || startStr;
      const { error } = await supabase.from("availability_requests").insert({
        user_id: user.id,
        date: startStr,
        end_date: endStr,
        reason: reason || null,
        request_type: requestType,
        blocked_shifts: requestType === "block" ? blockedShifts : [],
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["availability-requests"] });
      toast.success("Request submitted");
      closeDialog();
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

  const closeDialog = () => {
    setDialogOpen(false);
    setReason("");
    setEndDate("");
    setRequestType("block");
    setBlockedShifts([]);
    setSelectedDate(null);
  };

  const toggleShift = (shift: string) => {
    setBlockedShifts((prev) =>
      prev.includes(shift) ? prev.filter((s) => s !== shift) : [...prev, shift]
    );
  };

  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart);

  const getRequestsForDay = (day: Date) =>
    requests.filter((r) => {
      const start = parseISO(r.date);
      const end = (r as any).end_date ? parseISO((r as any).end_date) : start;
      return isSameDay(day, start) || isSameDay(day, end) || isWithinInterval(day, { start, end });
    });

  const getDayCellStyle = (dayReqs: any[]) => {
    if (dayReqs.length === 0) return "hover:bg-accent/50";
    const req = dayReqs[0];
    const type = (req as any).request_type || "block";
    if (type === "vacation") {
      return req.status === "approved"
        ? "bg-blue-100 border-blue-300"
        : "bg-blue-50 border-blue-200";
    }
    return req.status === "approved"
      ? "bg-destructive/10 border-destructive/30"
      : "bg-yellow-50 border-yellow-200";
  };

  const isSingleDay = !endDate || endDate === (selectedDate ? format(selectedDate, "yyyy-MM-dd") : "");

  const formatBlockedShifts = (req: any) => {
    const shifts: string[] = (req as any).blocked_shifts || [];
    if (shifts.length === 0) return null;
    return shifts.map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join(" & ");
  };

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
                  className={`h-16 md:h-20 rounded-md border p-1 text-xs cursor-pointer transition-colors flex flex-col items-center justify-start ${getDayCellStyle(dayReqs)}`}
                >
                  <span className="text-muted-foreground">{format(day, "d")}</span>
                  {dayReqs.map((r) => (
                    <div key={r.id} className="flex flex-col items-center gap-0 mt-0.5">
                      {typeIcons[(r as any).request_type || "block"]}
                      <Badge variant="outline" className={`text-[7px] md:text-[10px] px-0.5 md:px-1 py-0 leading-tight ${statusColors[r.status]}`}>
                        {r.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Requests list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No availability requests this month.</p>
          ) : (
            <div className="space-y-2">
              {requests.map((r) => {
                const rType = (r as any).request_type || "block";
                const rEnd = (r as any).end_date;
                const isRange = rEnd && rEnd !== r.date;
                const blockedLabel = formatBlockedShifts(r);
                return (
                  <div key={r.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">
                          {format(new Date(r.date), "EEE, MMM d")}
                          {isRange && ` → ${format(new Date(rEnd), "EEE, MMM d")}`}
                        </p>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {typeIcons[rType]}
                          <span className="ml-1">{rType}</span>
                        </Badge>
                        {blockedLabel && (
                          <Badge variant="outline" className="text-[10px]">
                            {blockedLabel} only
                          </Badge>
                        )}
                      </div>
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
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New request dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Availability Request</DialogTitle>
          </DialogHeader>
          {selectedDate && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={requestType} onValueChange={(v: any) => { setRequestType(v); setBlockedShifts([]); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="block">
                      <span className="flex items-center gap-2"><CalendarOff className="h-3 w-3" /> Block Dates</span>
                    </SelectItem>
                    <SelectItem value="vacation">
                      <span className="flex items-center gap-2"><Palmtree className="h-3 w-3" /> Vacation</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {requestType === "block" ? (
                <>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={format(selectedDate, "yyyy-MM-dd")}
                      onChange={(e) => {
                        const d = new Date(e.target.value + "T00:00:00");
                        if (!isNaN(d.getTime())) setSelectedDate(d);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Block specific shifts (optional)</Label>
                    <p className="text-xs text-muted-foreground">Leave unchecked to block the entire day</p>
                    <div className="flex gap-3">
                      {SHIFT_TYPES.map((type) => (
                        <label key={type} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={blockedShifts.includes(type)}
                            onCheckedChange={() => toggleShift(type)}
                          />
                          <span className="capitalize">{type}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input type="date" value={format(selectedDate, "yyyy-MM-dd")} readOnly className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={endDate || format(selectedDate, "yyyy-MM-dd")}
                      min={format(selectedDate, "yyyy-MM-dd")}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Reason (optional)</Label>
                <Input
                  placeholder="Reason for request"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={closeDialog}>Cancel</Button>
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
