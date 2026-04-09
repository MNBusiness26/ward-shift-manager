import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";
import { Check, X } from "lucide-react";

export default function Requests() {
  const queryClient = useQueryClient();

  const { data: availRequests = [] } = useQuery({
    queryKey: ["manager-avail-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_requests")
        .select("*, profiles:user_id(full_name)")
        .eq("status", "pending")
        .order("date");
      if (error) throw error;
      return data;
    },
  });

  const { data: swapRequests = [] } = useQuery({
    queryKey: ["manager-swap-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("swap_requests")
        .select("*, shifts(*), requester:requesting_user_id(full_name), coverer:covering_user_id(full_name)")
        .eq("status", "peer_accepted")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleAvailability = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "declined" }) => {
      const { error } = await supabase
        .from("availability_requests")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manager-avail-requests"] });
      toast.success("Request updated");
    },
  });

  const handleSwap = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "manager_approved" | "denied" }) => {
      const { error } = await supabase
        .from("swap_requests")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
      // If approved, update the shift assignment
      if (status === "manager_approved") {
        const swap = swapRequests.find((s) => s.id === id);
        if (swap?.covering_user_id && swap?.shift_id) {
          await supabase
            .from("shifts")
            .update({ assigned_user_id: swap.covering_user_id })
            .eq("id", swap.shift_id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manager-swap-requests"] });
      queryClient.invalidateQueries({ queryKey: ["roster-shifts"] });
      toast.success("Swap request handled");
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Request Management</h1>

      <Tabs defaultValue="availability">
        <TabsList>
          <TabsTrigger value="availability">
            Availability ({availRequests.length})
          </TabsTrigger>
          <TabsTrigger value="swaps">
            Swaps ({swapRequests.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="availability" className="mt-4">
          <Card>
            <CardContent className="p-4">
              {availRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending availability requests.</p>
              ) : (
                <div className="space-y-2">
                  {availRequests.map((req) => (
                    <div key={req.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">{(req.profiles as any)?.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(req.date), "EEE, MMM d, yyyy")}
                          {req.reason && ` — ${req.reason}`}
                        </p>
                      </div>
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
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="swaps" className="mt-4">
          <Card>
            <CardContent className="p-4">
              {swapRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No swaps awaiting approval.</p>
              ) : (
                <div className="space-y-2">
                  {swapRequests.map((swap) => (
                    <div key={swap.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">
                          {(swap.requester as any)?.full_name} → {(swap.coverer as any)?.full_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {swap.shifts?.date && format(new Date(swap.shifts.date), "EEE, MMM d")}
                          {` · ${swap.shifts?.type} shift`}
                        </p>
                      </div>
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
