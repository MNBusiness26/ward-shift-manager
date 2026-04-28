import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format } from "date-fns";
import { Check, X, CalendarOff, ArrowLeftRight, Clock, Filter, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "@/i18n/useTranslation";
import { formatLocale } from "@/i18n/dateLocale";

function formatShiftFn(shift: any, locale?: string) {
  if (!shift) return "—";
  return `${formatLocale(new Date(shift.date), "EEE, MMM d", locale)} · ${shift.type} (${shift.start_time?.slice(0, 5)}–${shift.end_time?.slice(0, 5)})`;
}

export default function Requests() {
  const { t, locale } = useTranslation();
  const formatShift = (shift: any) => formatShiftFn(shift, locale);
  const queryClient = useQueryClient();
  const [availFilter, setAvailFilter] = useState<"pending" | "all">("pending");
  const [swapFilter, setSwapFilter] = useState<"pending_all" | "peer_accepted" | "all">("pending_all");
  const [infoPopup, setInfoPopup] = useState<{ title: string; message: string } | null>(null);
  const [editingReq, setEditingReq] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [editForm, setEditForm] = useState<{ date: string; end_date: string; reason: string; blocked_shifts: string[]; request_type: string }>({
    date: "",
    end_date: "",
    reason: "",
    blocked_shifts: [],
    request_type: "block",
  });

  const openEdit = (req: any) => {
    setEditingReq(req);
    setEditForm({
      date: req.date ?? "",
      end_date: req.end_date ?? req.date ?? "",
      reason: req.reason ?? "",
      blocked_shifts: req.blocked_shifts ?? [],
      request_type: req.request_type ?? "block",
    });
  };

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!editingReq) return;
      if (!editForm.date) throw new Error("Start date required");
      const payload: any = {
        date: editForm.date,
        end_date: editForm.end_date || editForm.date,
        reason: editForm.reason || null,
        blocked_shifts: editForm.blocked_shifts,
        request_type: editForm.request_type,
      };
      const { error } = await supabase.from("availability_requests").update(payload).eq("id", editingReq.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manager-avail-requests"] });
      setEditingReq(null);
      toast.success(t("requests.requestUpdated"));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("availability_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manager-avail-requests"] });
      setConfirmDelete(null);
      toast.success(t("requests.requestDeleted"));
    },
    onError: (e: any) => toast.error(e.message),
  });

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
      if (swapFilter === "pending_all") q = q.in("status", ["pending", "peer_accepted"]);
      else if (swapFilter === "peer_accepted") q = q.eq("status", "peer_accepted");
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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["manager-avail-requests"] });
      setInfoPopup({ title: t("requests.requestUpdated"), message: `${t("requests.requestUpdated")} — ${variables.status === "approved" ? t("common.approved") : t("common.declined")}.` });
    },
  });

  const handleSwap = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "manager_approved" | "denied" }) => {
      const { error } = await supabase.from("swap_requests").update({ status }).eq("id", id);
      if (error) throw error;
      if (status === "manager_approved") {
        const swap = swapRequests.find((s) => s.id === id);
        if (swap?.covering_user_id && swap?.shift_id) {
          await supabase.from("shifts").update({ assigned_user_id: swap.covering_user_id }).eq("id", swap.shift_id);
          if (swap.target_shift_id && swap.requesting_user_id) {
            await supabase.from("shifts").update({ assigned_user_id: swap.requesting_user_id }).eq("id", swap.target_shift_id);
          }
        }
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["manager-swap-requests"] });
      queryClient.invalidateQueries({ queryKey: ["roster-shifts"] });
      setInfoPopup({ title: t("requests.requestUpdated"), message: `${t("requests.requestUpdated")} — ${variables.status === "manager_approved" ? t("common.approved") : t("common.declined")}.` });
    },
  });

  const pendingAvail = availRequests.filter((r) => r.status === "pending").length;
  const pendingSwaps = swapRequests.filter((r) => r.status === "pending" || r.status === "peer_accepted").length;

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

  const formatBlockedShifts = (req: any) => {
    const shifts: string[] = (req as any).blocked_shifts || [];
    if (shifts.length === 0) return null;
    return shifts.map((s: string) => t(`shift.${s}`)).join(" & ");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("requests.title")}</h1>
        <div className="flex gap-2">
          {pendingAvail > 0 && (
            <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">
              <CalendarOff className="me-1 h-3 w-3" />
              {pendingAvail} {t("requests.availability")}
            </Badge>
          )}
          {pendingSwaps > 0 && (
            <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
              <ArrowLeftRight className="me-1 h-3 w-3" />
              {pendingSwaps} {t("requests.swaps")}
            </Badge>
          )}
        </div>
      </div>

      <Tabs defaultValue="availability">
        <TabsList>
          <TabsTrigger value="availability">
            <CalendarOff className="me-1 h-4 w-4" />
            {t("requests.availability")} ({availRequests.length})
          </TabsTrigger>
          <TabsTrigger value="swaps">
            <ArrowLeftRight className="me-1 h-4 w-4" />
            {t("requests.swaps")} ({swapRequests.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="availability" className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={availFilter} onValueChange={(v: any) => setAvailFilter(v)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">{t("requests.pendingOnly")}</SelectItem>
                <SelectItem value="all">{t("requests.allRequests")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-4">
              {availRequests.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-muted-foreground">
                  <CalendarOff className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">{t("requests.noAvailRequests")}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {availRequests.map((req) => {
                    const blockedLabel = formatBlockedShifts(req);
                    return (
                      <div key={req.id} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/30 transition-colors">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">{(req.profiles as any)?.full_name}</p>
                             <Badge variant="outline" className={`text-[10px] ${statusBadge(req.status)}`}>
                              {t(`status.${req.status}`)}
                            </Badge>
                            {(req as any).created_by_manager_id && (
                              <Badge variant="outline" className="text-[10px]">{t("requests.managerProxy")}</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <p className="text-xs text-muted-foreground">
                              <Clock className="inline me-1 h-3 w-3" />
                              {formatLocale(new Date(req.date), "EEE, MMM d, yyyy", locale)}
                              {(req as any).end_date && (req as any).end_date !== req.date && ` → ${formatLocale(new Date((req as any).end_date), "EEE, MMM d, yyyy", locale)}`}
                              {req.reason && ` — "${req.reason}"`}
                            </p>
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {(() => {
                                const rt = (req as any).request_type;
                                switch (rt) {
                                  case "vacation": return `🌴 ${t("avail.vacationLabel")}`;
                                  case "leave": return `✈️ ${t("avail.leaveLabel")}`;
                                  case "sick_leave": return `🩹 ${t("avail.sickLeaveLabel")}`;
                                  case "maternity_leave": return `🍼 ${t("avail.maternityLeaveLabel")}`;
                                  case "yearly_leave": return `🌴 ${t("avail.yearlyLeaveLabel")}`;
                                  default: return `🚫 ${t("avail.blockDates")}`;
                                }
                              })()}
                            </Badge>
                            {blockedLabel && (
                              <Badge variant="outline" className="text-[10px]">
                                {blockedLabel} {t("avail.only")}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {req.status === "pending" && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-green-600 hover:bg-green-50"
                                title={t("requests.approve")}
                                onClick={() => handleAvailability.mutate({ id: req.id, status: "approved" })}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                title={t("common.cancel")}
                                onClick={() => handleAvailability.mutate({ id: req.id, status: "declined" })}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title={t("requests.editRequest")}
                            onClick={() => openEdit(req)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            title={t("requests.cancelBlock")}
                            onClick={() => setConfirmDelete(req)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="swaps" className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={swapFilter} onValueChange={(v: any) => setSwapFilter(v)}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending_all">{t("requests.allPending")}</SelectItem>
                <SelectItem value="peer_accepted">{t("requests.awaitingManager")}</SelectItem>
                <SelectItem value="all">{t("requests.allRequests")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-4">
              {swapRequests.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-muted-foreground">
                  <ArrowLeftRight className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">{t("requests.noSwapRequests")}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {swapRequests.map((swap) => (
                    <div key={swap.id} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/30 transition-colors">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">
                            {(swap.requester as any)?.full_name} → {(swap.coverer as any)?.full_name || "Pool"}
                          </p>
                           <Badge variant="outline" className={`text-[10px] ${statusBadge(swap.status)}`}>
                            {t(`status.${swap.status}`)}
                          </Badge>
                          {swap.is_pool_request && (
                            <Badge variant="outline" className="text-[10px]">{t("common.pool")}</Badge>
                          )}
                          {swap.is_take_only && (
                            <Badge variant="outline" className="text-[10px]">{t("common.takeOnly")}</Badge>
                          )}
                          {swap.status === "pending" && (
                            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                              {t("requests.noPeerResponse")}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                        <Clock className="inline me-1 h-3 w-3" />
                          {t("swap.offering")}: {formatShift((swap as any).requesting_shift)}
                        </p>
                        {(swap as any).target_shift && (
                          <p className="text-xs text-muted-foreground">
                            {t("swap.inReturn")}: {formatShift((swap as any).target_shift)}
                          </p>
                        )}
                      </div>
                      {/* Manager can approve/deny both pending and peer_accepted swaps */}
                      {(swap.status === "peer_accepted" || swap.status === "pending") && (
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-green-600 hover:bg-green-50"
                            title={swap.status === "pending" ? t("requests.approveOverride") : t("requests.approve")}
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

      {/* Edit availability request dialog */}
      <Dialog open={!!editingReq} onOpenChange={(open) => !open && setEditingReq(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("requests.editRequest")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("avail.blockDates")}</Label>
              <Select value={editForm.request_type} onValueChange={(v) => setEditForm((f) => ({ ...f, request_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="block">🚫 {t("avail.blockDates")}</SelectItem>
                  <SelectItem value="vacation">🌴 {t("avail.vacationLabel")}</SelectItem>
                  <SelectItem value="leave">✈️ {t("avail.leaveLabel")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("avail.startDate")}</Label>
                <Input type="date" value={editForm.date} onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("avail.endDate")}</Label>
                <Input type="date" value={editForm.end_date} onChange={(e) => setEditForm((f) => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("avail.blockShifts")}</Label>
              <div className="flex gap-3">
                {(["morning", "evening", "night"] as const).map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={editForm.blocked_shifts.includes(s)}
                      onCheckedChange={(c) =>
                        setEditForm((f) => ({
                          ...f,
                          blocked_shifts: c ? [...f.blocked_shifts, s] : f.blocked_shifts.filter((x) => x !== s),
                        }))
                      }
                    />
                    {t(`shift.${s}`)}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("avail.reasonOptional")}</Label>
              <Textarea
                value={editForm.reason}
                placeholder={t("avail.reasonPlaceholder")}
                onChange={(e) => setEditForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingReq(null)}>{t("common.cancel")}</Button>
            <Button onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending}>
              {t("requests.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm cancel/delete block */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("requests.cancelBlock")}</AlertDialogTitle>
            <AlertDialogDescription>{t("requests.cancelBlockConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && deleteRequest.mutate(confirmDelete.id)}
            >
              {t("requests.cancelBlock")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!infoPopup} onOpenChange={(open) => !open && setInfoPopup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{infoPopup?.title}</AlertDialogTitle>
            <AlertDialogDescription>{infoPopup?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setInfoPopup(null)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
