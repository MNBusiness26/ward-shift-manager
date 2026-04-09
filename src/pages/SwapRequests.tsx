import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { useState } from "react";
import { ArrowLeftRight, Users, X } from "lucide-react";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  peer_accepted: "bg-blue-100 text-blue-800",
  manager_approved: "bg-green-100 text-green-800",
  denied: "bg-red-100 text-red-800",
};

export default function SwapRequests() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState("");
  const [swapType, setSwapType] = useState<"direct" | "pool">("pool");
  const [targetUserId, setTargetUserId] = useState("");
  const [cancelId, setCancelId] = useState<string | null>(null);

  const { data: myShifts = [] } = useQuery({
    queryKey: ["my-shifts-for-swap", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .eq("assigned_user_id", user!.id)
        .gte("date", format(new Date(), "yyyy-MM-dd"))
        .order("date");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: swapRequests = [] } = useQuery({
    queryKey: ["swap-requests", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("swap_requests")
        .select("*, shifts(*), covering_profile:profiles!swap_requests_covering_user_id_fkey(full_name), requesting_profile:profiles!swap_requests_requesting_user_id_fkey(full_name)")
        .or(`requesting_user_id.eq.${user!.id},covering_user_id.eq.${user!.id},is_pool_request.eq.true`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: colleagues = [] } = useQuery({
    queryKey: ["colleagues"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("is_active", true)
        .neq("id", user!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const createSwap = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("swap_requests").insert({
        requesting_user_id: user!.id,
        shift_id: selectedShiftId,
        is_pool_request: swapType === "pool",
        covering_user_id: swapType === "direct" ? targetUserId : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swap-requests"] });
      toast.success(swapType === "pool" ? "Posted to swap pool" : "Swap request sent");
      setDialogOpen(false);
      setSelectedShiftId("");
      setTargetUserId("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const acceptSwap = useMutation({
    mutationFn: async (swapId: string) => {
      const { error } = await supabase
        .from("swap_requests")
        .update({ covering_user_id: user!.id, status: "peer_accepted" })
        .eq("id", swapId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swap-requests"] });
      toast.success("Swap accepted — waiting for manager approval");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cancelSwap = useMutation({
    mutationFn: async (swapId: string) => {
      const { error } = await supabase
        .from("swap_requests")
        .delete()
        .eq("id", swapId)
        .eq("requesting_user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swap-requests"] });
      toast.success("Swap request cancelled");
      setCancelId(null);
    },
    onError: (e: any) => {
      toast.error(e.message);
      setCancelId(null);
    },
  });

  const canCancel = (swap: any) =>
    swap.requesting_user_id === user?.id &&
    (swap.status === "pending" || swap.status === "peer_accepted");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Swap Requests</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <ArrowLeftRight className="mr-2 h-4 w-4" />
          New Swap
        </Button>
      </div>

      {/* Pool offers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Pool Offers
          </CardTitle>
        </CardHeader>
        <CardContent>
          {swapRequests.filter((s) => s.is_pool_request && s.status === "pending" && s.requesting_user_id !== user?.id).length === 0 ? (
            <p className="text-sm text-muted-foreground">No pool offers available.</p>
          ) : (
            <div className="space-y-2">
              {swapRequests
                .filter((s) => s.is_pool_request && s.status === "pending" && s.requesting_user_id !== user?.id)
                .map((swap) => (
                  <div key={swap.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">
                        {swap.shifts?.type && `${swap.shifts.type.charAt(0).toUpperCase() + swap.shifts.type.slice(1)} Shift`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {swap.shifts?.date && format(new Date(swap.shifts.date), "EEE, MMM d")}
                        {swap.shifts && ` · ${swap.shifts.start_time?.slice(0, 5)} — ${swap.shifts.end_time?.slice(0, 5)}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        From: {(swap as any).requesting_profile?.full_name || "Unknown"}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => acceptSwap.mutate(swap.id)}>
                      Claim
                    </Button>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* My swap requests */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">My Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {swapRequests.filter((s) => s.requesting_user_id === user?.id || s.covering_user_id === user?.id).length === 0 ? (
            <p className="text-sm text-muted-foreground">No swap requests yet.</p>
          ) : (
            <div className="space-y-2">
              {swapRequests
                .filter((s) => s.requesting_user_id === user?.id || s.covering_user_id === user?.id)
                .map((swap) => (
                  <div key={swap.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">
                        {swap.is_pool_request ? "Pool Offer" : "Direct Swap"}
                        {!swap.is_pool_request && (swap as any).covering_profile?.full_name && (
                          <span className="font-normal text-muted-foreground">
                            {" "}with {(swap as any).covering_profile.full_name}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {swap.shifts?.date && format(new Date(swap.shifts.date), "EEE, MMM d")}
                        {swap.shifts && ` · ${swap.shifts.type} ${swap.shifts.start_time?.slice(0, 5)} — ${swap.shifts.end_time?.slice(0, 5)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={statusColors[swap.status]}>
                        {swap.status.replace("_", " ")}
                      </Badge>
                      {canCancel(swap) && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          onClick={() => setCancelId(swap.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancel confirmation */}
      <AlertDialog open={!!cancelId} onOpenChange={(open) => !open && setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel swap request?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this swap request? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => cancelId && cancelSwap.mutate(cancelId)}
            >
              Yes, cancel swap
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New swap dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request a Swap</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={selectedShiftId} onValueChange={setSelectedShiftId}>
              <SelectTrigger>
                <SelectValue placeholder="Select shift to swap" />
              </SelectTrigger>
              <SelectContent>
                {myShifts.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {format(new Date(s.date), "EEE, MMM d")} · {s.type} ({s.start_time.slice(0, 5)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Button
                variant={swapType === "pool" ? "default" : "outline"}
                size="sm"
                onClick={() => setSwapType("pool")}
              >
                Pool Offer
              </Button>
              <Button
                variant={swapType === "direct" ? "default" : "outline"}
                size="sm"
                onClick={() => setSwapType("direct")}
              >
                Direct Request
              </Button>
            </div>

            {swapType === "direct" && (
              <Select value={targetUserId} onValueChange={setTargetUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select colleague" />
                </SelectTrigger>
                <SelectContent>
                  {colleagues.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() => createSwap.mutate()}
                disabled={!selectedShiftId || (swapType === "direct" && !targetUserId) || createSwap.isPending}
              >
                Submit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
