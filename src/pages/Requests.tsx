import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";
import { Check, X, CalendarOff, ArrowLeftRight, Clock, Filter } from "lucide-react";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function formatShift(shift: any) {
  if (!shift) return "—";
  return `${format(new Date(shift.date), "EEE, MMM d")} · ${shift.type} (${shift.start_time?.slice(0, 5)}–${shift.end_time?.slice(0, 5)})`;
}

export default function Requests() {
  const queryClient = useQueryClient();
  const [availFilter, setAvailFilter] = useState<"pending" | "all">("pending");
  const [swapFilter, setSwapFilter] = useState<"peer_accepted" | "all">("peer_accepted");

  const { data: availRequests = [] } = useQuery({
    queryKey: ["manager-avail-requests", availFilter],
    queryFn: async () => {
      let q = supabase
        .from("availability_requests")
        .select("*, profiles:user_id(full_name)")
        .order("date");
      if (availFilter === "pending") q = q.eq("status", "pending");
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const { data: swapRequests = [] } = useQuery({
    queryKey: ["manager-swap-requests", swapFilter],
    queryFn: async () => {
      let q = supabase
        .from("swap_requests")
        .select("*, requesting_shift:shifts!swap_requests_shift_id_fkey(*), target_shift:shifts!swap_requests_target_shift_id_fkey(*), requester:requesting_user_id(full_name), coverer:covering_user_id(full_name)")
        .order("created_at", { ascending: false });
      if (swapFilter === "peer_accepted") q = q.eq("status", "peer_accepted");
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const handleAvailability = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "declined" }) => {
      const { error } = await supabase.from("availability_requests").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manager-avail-requests"] });
      toast.success("Request updated");
    },
  });

  const handleSwap = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "manager_approved" | "denied" }) => {
      const { error } = await supabase.from("swap_requests").update({ status }).eq("id", id);
      if (error) throw error;
      if (status === "manager_approved") {
        const swap = swapRequests.find((s) => s.id === id);
        if (swap?.covering_user_id && swap?.shift_id) {
          // Flip the requesting shift to covering user
          await supabase.from("shifts").update({ assigned_user_id: swap.covering_user_id }).eq("id", swap.shift_id);
          // If there's a target shift, flip it to requesting user (true swap)
          if (swap.target_shift_id && swap.requesting_user_id) {
            await supabase.from("shifts").update({ assigned_user_id: swap.requesting_user_id }).eq("id", swap.target_shift_id);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manager-swap-requests"] });
      queryClient.invalidateQueries({ queryKey: ["roster-shifts"] });
      toast.success("Swap request handled");
    },
  });

  const pendingAvail = availRequests.filter((r) => r.status === "pending").length;
  const pendingSwaps = swapRequests.filter((r) => r.status === "peer_accepted").length;

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
      approved: "bg-green-100 text-green-800 border-green-200",
      declined: "bg-destructive/10 text-destructive border-destructive/20",
      peer_accepted: "bg-blue-100 text-blue-800 border-blue-200",
      manager_approved: "bg-green-100 text-green-800 border-green-200",
      denied: "bg-destructive/10 text-destructive border-destructive/20",
    };
    return map[status] || "";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Request Management</h1>
        <div className="flex gap-2">
          {pendingAvail > 0 && (
            <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">
              <CalendarOff className="mr-1 h-3 w-3" />
              {pendingAvail} availability
            </Badge>
          )}
          {pendingSwaps > 0 && (
            <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
              <ArrowLeftRight className="mr-1 h-3 w-3" />
              {pendingSwaps} swap{pendingSwaps > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </div>

      <Tabs defaultValue="availability">
        <TabsList>
          <TabsTrigger value="availability">
            <CalendarOff className="mr-1 h-4 w-4" />
            Availability ({availRequests.length})
          </TabsTrigger>
          <TabsTrigger value="swaps">
            <ArrowLeftRight className="mr-1 h-4 w-4" />
            Swaps ({swapRequests.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="availability" className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={availFilter} onValueChange={(v: any) => setAvailFilter(v)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending Only</SelectItem>
                <SelectItem value="all">All Requests</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-4">
              {availRequests.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-muted-foreground">
                  <CalendarOff className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No availability requests.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {availRequests.map((req) => (
                    <div key={req.id} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/30 transition-colors">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{(req.profiles as any)?.full_name}</p>
                          <Badge variant="outline" className={`text-[10px] ${statusBadge(req.status)}`}>
                            {req.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-muted-foreground">
                            <Clock className="inline mr-1 h-3 w-3" />
                            {format(new Date(req.date), "EEE, MMM d, yyyy")}
                            {(req as any).end_date && (req as any).end_date !== req.date && ` → ${format(new Date((req as any).end_date), "EEE, MMM d, yyyy")}`}
                            {req.reason && ` — "${req.reason}"`}
                          </p>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {(req as any).request_type === "vacation" ? "🌴 Vacation" : "🚫 Block"}
                          </Badge>
                        </div>
                      </div>
                      {req.status === "pending" && (
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-green-600 hover:bg-green-50"
                            onClick={() => handleAvailability.mutate({ id: req.id, status: "approved" })}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            onClick={() => handleAvailability.mutate({ id: req.id, status: "declined" })}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="swaps" className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={swapFilter} onValueChange={(v: any) => setSwapFilter(v)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="peer_accepted">Awaiting Approval</SelectItem>
                <SelectItem value="all">All Requests</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-4">
              {swapRequests.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-muted-foreground">
                  <ArrowLeftRight className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No swap requests.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {swapRequests.map((swap) => (
                    <div key={swap.id} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/30 transition-colors">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">
                            {(swap.requester as any)?.full_name} → {(swap.coverer as any)?.full_name || "Pool"}
                          </p>
                          <Badge variant="outline" className={`text-[10px] ${statusBadge(swap.status)}`}>
                            {swap.status.replace("_", " ")}
                          </Badge>
                          {swap.is_pool_request && (
                            <Badge variant="outline" className="text-[10px]">Pool</Badge>
                          )}
                          {swap.is_take_only && (
                            <Badge variant="outline" className="text-[10px]">Take Only</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <Clock className="inline mr-1 h-3 w-3" />
                          Offering: {formatShift((swap as any).requesting_shift)}
                        </p>
                        {(swap as any).target_shift && (
                          <p className="text-xs text-muted-foreground">
                            In return: {formatShift((swap as any).target_shift)}
                          </p>
                        )}
                      </div>
                      {swap.status === "peer_accepted" && (
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-green-600 hover:bg-green-50"
                            onClick={() => handleSwap.mutate({ id: swap.id, status: "manager_approved" })}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            onClick={() => handleSwap.mutate({ id: swap.id, status: "denied" })}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
