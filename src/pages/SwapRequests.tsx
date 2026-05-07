import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/i18n/useTranslation";
import { formatLocale } from "@/i18n/dateLocale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Checkbox } from "@/components/ui/checkbox";
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

function formatShiftFn(shift: any, locale?: string) {
  if (!shift) return "";
  return `${formatLocale(new Date(shift.date), "EEE, MMM d", locale)} · ${shift.type} (${shift.start_time?.slice(0, 5)}–${shift.end_time?.slice(0, 5)})`;
}

export default function SwapRequests() {
  const { user, profile, confirmIfImpersonating } = useAuth();
  const viewUserId = profile?.id ?? viewUserId;
  const { t, locale } = useTranslation();
  const formatShift = (shift: any) => formatShiftFn(shift, locale);
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState("");
  const [swapType, setSwapType] = useState<"direct" | "pool">("pool");
  const [targetUserId, setTargetUserId] = useState("");
  const [targetShiftId, setTargetShiftId] = useState("");
  const [cancelId, setCancelId] = useState<string | null>(null);

  // Pool response state
  const [poolRespondId, setPoolRespondId] = useState<string | null>(null);
  const [poolOfferShiftId, setPoolOfferShiftId] = useState("");
  const [poolTakeOnly, setPoolTakeOnly] = useState(false);

  const { data: myShifts = [] } = useQuery({
    queryKey: ["my-shifts-for-swap", viewUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .eq("assigned_user_id", viewUserId!)
        .eq("is_draft", false)
        .gte("date", format(new Date(), "yyyy-MM-dd"))
        .order("date");
      if (error) throw error;
      return data;
    },
    enabled: !!viewUserId,
  });

  const { data: swapRequests = [] } = useQuery({
    queryKey: ["swap-requests", viewUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("swap_requests")
        .select("*, requesting_shift:shifts!swap_requests_shift_id_fkey(*), target_shift:shifts!swap_requests_target_shift_id_fkey(*), covering_profile:profiles!swap_requests_covering_user_id_fkey(full_name), requesting_profile:profiles!swap_requests_requesting_user_id_fkey(full_name)")
        .or(`requesting_user_id.eq.${viewUserId},covering_user_id.eq.${viewUserId},is_pool_request.eq.true`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!viewUserId,
  });

  const { data: colleagues = [] } = useQuery({
    queryKey: ["colleagues", viewUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("is_active", true)
        .neq("id", viewUserId!);
      if (error) throw error;
      return data;
    },
    enabled: !!viewUserId,
  });

  // Fetch target colleague's shifts for direct swap
  const { data: targetUserShifts = [] } = useQuery({
    queryKey: ["target-user-shifts", targetUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .eq("assigned_user_id", targetUserId)
        .eq("is_draft", false)
        .gte("date", format(new Date(), "yyyy-MM-dd"))
        .order("date");
      if (error) throw error;
      return data;
    },
    enabled: !!targetUserId,
  });

  const createSwap = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("swap_requests").insert({
        requesting_user_id: viewUserId!,
        shift_id: selectedShiftId,
        is_pool_request: swapType === "pool",
        covering_user_id: swapType === "direct" ? targetUserId : null,
        target_shift_id: swapType === "direct" && targetShiftId ? targetShiftId : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swap-requests"] });
      toast.success(swapType === "pool" ? t("swap.postedPool") : t("swap.requestSent"));
      setDialogOpen(false);
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const acceptSwap = useMutation({
    mutationFn: async (swapId: string) => {
      const { error } = await supabase
        .from("swap_requests")
        .update({ covering_user_id: viewUserId!, status: "peer_accepted" })
        .eq("id", swapId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swap-requests"] });
      toast.success(t("swap.accepted"));
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Pool response: offer own shift or take-only
  const respondToPool = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("swap_requests")
        .update({
          covering_user_id: viewUserId!,
          status: "peer_accepted",
          target_shift_id: poolTakeOnly ? null : poolOfferShiftId || null,
          is_take_only: poolTakeOnly,
        })
        .eq("id", poolRespondId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swap-requests"] });
      toast.success(poolTakeOnly ? t("swap.offered") : t("swap.offerSent"));
      setPoolRespondId(null);
      setPoolOfferShiftId("");
      setPoolTakeOnly(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cancelSwap = useMutation({
    mutationFn: async (swapId: string) => {
      const { error } = await supabase
        .from("swap_requests")
        .delete()
        .eq("id", swapId)
        .eq("requesting_user_id", viewUserId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swap-requests"] });
      toast.success(t("swap.cancelled"));
      setCancelId(null);
    },
    onError: (e: any) => {
      toast.error(e.message);
      setCancelId(null);
    },
  });

  const resetForm = () => {
    setSelectedShiftId("");
    setTargetUserId("");
    setTargetShiftId("");
  };

  const canCancel = (swap: any) =>
    swap.requesting_user_id === viewUserId &&
    (swap.status === "pending" || swap.status === "peer_accepted");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("page.swapRequests")}</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <ArrowLeftRight className="me-2 h-4 w-4" />
          {t("swap.newSwap")}
        </Button>
      </div>

      {/* Pool offers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            {t("swap.poolOffers")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {swapRequests.filter((s) => s.is_pool_request && s.status === "pending" && s.requesting_user_id !== viewUserId).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("swap.noPoolOffers")}</p>
          ) : (
            <div className="space-y-2">
              {swapRequests
                .filter((s) => s.is_pool_request && s.status === "pending" && s.requesting_user_id !== viewUserId)
                .map((swap) => (
                  <div key={swap.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">
                        {(swap as any).requesting_shift?.type && `${(swap as any).requesting_shift.type.charAt(0).toUpperCase() + (swap as any).requesting_shift.type.slice(1)} Shift`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatShift((swap as any).requesting_shift)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("swap.from")}: {(swap as any).requesting_profile?.full_name || t("common.unknown")}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => setPoolRespondId(swap.id)}>
                      {t("swap.respond")}
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
          <CardTitle className="text-base">{t("swap.myRequests")}</CardTitle>
        </CardHeader>
        <CardContent>
          {swapRequests.filter((s) => s.requesting_user_id === viewUserId || s.covering_user_id === viewUserId).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("swap.noRequests")}</p>
          ) : (
            <div className="space-y-2">
              {swapRequests
                .filter((s) => s.requesting_user_id === viewUserId || s.covering_user_id === viewUserId)
                .map((swap) => (
                  <div key={swap.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">
                        {swap.is_pool_request ? t("swap.poolOffer") : t("swap.directSwap")}
                        {!swap.is_pool_request && (swap as any).covering_profile?.full_name && (
                          <span className="font-normal text-muted-foreground">
                            {" "}{t("swap.with")} {(swap as any).covering_profile.full_name}
                          </span>
                        )}
                        {swap.is_take_only && (
                          <Badge variant="outline" className="ms-2 text-[10px]">{t("swap.takeOnly")}</Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("swap.offering")}: {formatShift((swap as any).requesting_shift)}
                      </p>
                      {(swap as any).target_shift && (
                        <p className="text-xs text-muted-foreground">
                          {t("swap.inReturn")}: {formatShift((swap as any).target_shift)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                       <Badge variant="outline" className={statusColors[swap.status]}>
                        {t(`status.${swap.status}`)}
                      </Badge>
                      {/* Peer accept for direct swaps targeting current user */}
                      {swap.covering_user_id === viewUserId && swap.status === "pending" && !swap.is_pool_request && (
                        <Button size="sm" variant="outline" onClick={() => acceptSwap.mutate(swap.id)}>
                          {t("swap.accept")}
                        </Button>
                      )}
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
            <AlertDialogTitle>{t("swap.cancelTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("swap.cancelDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("swap.cancelNo")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => cancelId && cancelSwap.mutate(cancelId)}
            >
              {t("swap.cancelYes")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pool response dialog */}
      <Dialog open={!!poolRespondId} onOpenChange={(open) => {
        if (!open) {
          setPoolRespondId(null);
          setPoolOfferShiftId("");
          setPoolTakeOnly(false);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("swap.respondTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="take-only"
                checked={poolTakeOnly}
                onCheckedChange={(v) => {
                  setPoolTakeOnly(!!v);
                  if (v) setPoolOfferShiftId("");
                }}
              />
              <label htmlFor="take-only" className="text-sm font-medium">
                {t("swap.takeWithout")}
              </label>
            </div>

            {!poolTakeOnly && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">{t("swap.offerShift")}</p>
                <Select value={poolOfferShiftId} onValueChange={setPoolOfferShiftId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("swap.selectShift")} />
                  </SelectTrigger>
                  <SelectContent>
                    {myShifts.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {formatShift(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setPoolRespondId(null)}>{t("common.cancel")}</Button>
              <Button
                onClick={() => respondToPool.mutate()}
                disabled={(!poolTakeOnly && !poolOfferShiftId) || respondToPool.isPending}
              >
                {t("common.submit")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New swap dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("swap.requestSwap")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={selectedShiftId} onValueChange={setSelectedShiftId}>
              <SelectTrigger>
                <SelectValue placeholder={t("swap.selectShift")} />
              </SelectTrigger>
              <SelectContent>
                {myShifts.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {formatShift(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Button
                variant={swapType === "pool" ? "default" : "outline"}
                size="sm"
                onClick={() => { setSwapType("pool"); setTargetUserId(""); setTargetShiftId(""); }}
              >
                {t("swap.poolOffer")}
              </Button>
              <Button
                variant={swapType === "direct" ? "default" : "outline"}
                size="sm"
                onClick={() => setSwapType("direct")}
              >
                {t("swap.directRequest")}
              </Button>
            </div>

            {swapType === "direct" && (
              <>
                <Select value={targetUserId} onValueChange={(v) => { setTargetUserId(v); setTargetShiftId(""); }}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("swap.selectColleague")} />
                  </SelectTrigger>
                  <SelectContent>
                    {colleagues.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {targetUserId && (
                  <Select value={targetShiftId} onValueChange={setTargetShiftId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("swap.selectTheirShift")} />
                    </SelectTrigger>
                    <SelectContent>
                      {targetUserShifts.length === 0 ? (
                        <SelectItem value="__none" disabled>{t("swap.noShiftsAvail")}</SelectItem>
                      ) : (
                        targetUserShifts.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {formatShift(s)}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
              </>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
              <Button
                onClick={() => createSwap.mutate()}
                disabled={!selectedShiftId || (swapType === "direct" && (!targetUserId || !targetShiftId)) || createSwap.isPending}
              >
                {t("common.submit")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
