import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { UserCheck, UserX, Pencil, Users, Clock, Shield, Star, X, ChartLine, Mail } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTranslation } from "@/i18n/useTranslation";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

const SHIFT_TYPES = ["morning", "evening", "night"] as const;
const SHIFT_LABELS: Record<string, string> = { morning: "M", evening: "E", night: "N" };
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Staff() {
  const { isManager } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editDialog, setEditDialog] = useState(false);
  const [editMember, setEditMember] = useState<any>(null);
  const [activateConfirm, setActivateConfirm] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    full_name: "",
    target_fte_percent: 1,
    role: "nurse" as AppRole,
    is_responsible: false,
    is_assistant_manager: false,
    no_nights: false,
    no_weekends: false,
    excluded_shifts: [] as string[],
    excluded_days: [] as number[],
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["staff-management"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role),
      }));
    },
  });

  // Unclaimed staff_directory entries — i.e. imported staff who haven't signed up yet.
  const { data: pendingDirectory = [] } = useQuery({
    queryKey: ["pending-directory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_directory")
        .select("*")
        .eq("is_claimed", false)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from("profiles").update({ is_active: isActive }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-management"] });
      toast.success("Staff status updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!editMember) return;
      const constraints = {
        ...(typeof editMember.constraints === "object" ? editMember.constraints : {}),
        no_nights: editForm.no_nights,
        no_weekends: editForm.no_weekends,
        excluded_shifts: editForm.excluded_shifts,
        excluded_days: editForm.excluded_days,
      };
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: editForm.full_name,
          target_fte_percent: editForm.target_fte_percent,
          is_responsible: editForm.is_responsible,
          constraints,
        })
        .eq("id", editMember.id);
      if (error) throw error;

      // Handle primary role
      const currentRole = editMember.roles?.[0];
      if (currentRole !== editForm.role) {
        if (currentRole) {
          await supabase.from("user_roles").delete().eq("user_id", editMember.id).eq("role", currentRole);
        }
        await supabase.from("user_roles").insert({ user_id: editMember.id, role: editForm.role });
      }

      // Handle assistant_manager toggle
      const hadAM = (editMember.roles ?? []).includes("assistant_manager");
      if (editForm.is_assistant_manager && !hadAM) {
        await supabase.from("user_roles").insert({ user_id: editMember.id, role: "assistant_manager" as AppRole });
      } else if (!editForm.is_assistant_manager && hadAM) {
        await supabase.from("user_roles").delete().eq("user_id", editMember.id).eq("role", "assistant_manager");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-management"] });
      setEditDialog(false);
      toast.success("Profile updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (member: any) => {
    setEditMember(member);
    const constraints = typeof member.constraints === "object" && member.constraints !== null ? member.constraints : {};
    setEditForm({
      full_name: member.full_name || "",
      target_fte_percent: member.target_fte_percent ?? 1,
      role: member.roles?.[0] || "nurse",
      is_responsible: !!member.is_responsible,
      is_assistant_manager: (member.roles ?? []).includes("assistant_manager"),
      no_nights: !!(constraints as any).no_nights,
      no_weekends: !!(constraints as any).no_weekends,
      excluded_shifts: (constraints as any).excluded_shifts || [],
      excluded_days: (constraints as any).excluded_days || [],
    });
    setEditDialog(true);
  };

  const toggleExcludedShift = (shift: string) => {
    setEditForm((f) => ({
      ...f,
      excluded_shifts: f.excluded_shifts.includes(shift)
        ? f.excluded_shifts.filter((s) => s !== shift)
        : [...f.excluded_shifts, shift],
    }));
  };

  const toggleExcludedDay = (day: number) => {
    setEditForm((f) => ({
      ...f,
      excluded_days: f.excluded_days.includes(day)
        ? f.excluded_days.filter((d) => d !== day)
        : [...f.excluded_days, day],
    }));
  };

  const inactiveProfiles = staff.filter((s) => !s.is_active);
  const activeStaff = staff.filter((s) => s.is_active);
  // "Pending" for the demo = unclaimed staff_directory entries (no profile yet)
  const pendingStaff = pendingDirectory;
  const totalRoster = activeStaff.length + pendingStaff.length;

  const getExclusionBadges = (member: any) => {
    const c = typeof member.constraints === "object" && member.constraints !== null ? member.constraints : {};
    const badges: string[] = [];
    const exShifts: string[] = (c as any).excluded_shifts || [];
    const exDays: number[] = (c as any).excluded_days || [];
    if (exShifts.length > 0) badges.push(`No ${exShifts.map((s: string) => s.charAt(0).toUpperCase()).join("/")}`);
    if (exDays.length > 0) badges.push(`No ${exDays.map((d: number) => DAY_LABELS[d]).join("/")}`);
    // Legacy
    if ((c as any).no_nights && !exShifts.includes("night")) badges.push("No nights");
    if ((c as any).no_weekends && !exDays.includes(6)) badges.push("No weekends");
    return badges;
  };

  return (
    <div className="space-y-6">
  // --- Renderers (used inside multiple tabs) ---
  const renderActiveRow = (member: any) => {
    const exclusionBadges = getExclusionBadges(member);
    return (
      <div key={member.id} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/30 transition-colors">
        <div>
          <p className="text-sm font-medium">{member.full_name}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {member.roles?.map((role: string) => (
              <Badge key={role} variant="outline" className={`text-xs capitalize ${role === "manager" ? "bg-primary/10 text-primary border-primary/20" : ""}`}>
                {role === "manager" && <Shield className="mr-0.5 h-2.5 w-2.5" />}
                {role}
              </Badge>
            ))}
            <span className="text-xs text-muted-foreground">
              {(member.target_fte_percent * 100).toFixed(0)}% FTE
            </span>
            {member.is_responsible && (
              <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                <Star className="mr-0.5 h-2.5 w-2.5" /> Resp. Nurse
              </Badge>
            )}
            {exclusionBadges.map((label) => (
              <Badge key={label} variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20">
                <X className="mr-0.5 h-2.5 w-2.5" /> {label}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" title="View Stats" onClick={() => navigate(`/staff-stats?id=${member.id}`)}>
            <ChartLine className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(member)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive hover:bg-destructive/10"
            onClick={() => toggleActive.mutate({ id: member.id, isActive: false })}
          >
            <UserX className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  const renderPendingRow = (entry: any) => (
    <div key={entry.id} className="flex items-center justify-between rounded-sm border border-amber-200 bg-amber-50 p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium truncate">{entry.full_name}</p>
          <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 border-amber-300">
            <Clock className="me-0.5 h-2.5 w-2.5" /> Pending
          </Badge>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-muted-foreground">
          <span className="capitalize">{entry.app_role}</span>
          <span className="flex items-center gap-1">
            <Mail className="h-3 w-3" /> {entry.email}
          </span>
          <span>{Math.round(Number(entry.target_fte_percent) * 100)}% FTE</span>
        </div>
      </div>
      <Badge variant="outline" className="text-[10px]">Schedulable</Badge>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">{t("staff.title")}</h1>
        <div className="flex gap-2">
          <Badge variant="outline">
            <Users className="me-1 h-3 w-3" />
            {totalRoster} Total
          </Badge>
          <Badge variant="outline">
            <UserCheck className="me-1 h-3 w-3" />
            {activeStaff.length} Registered
          </Badge>
          {pendingStaff.length > 0 && (
            <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
              <Clock className="me-1 h-3 w-3" />
              {pendingStaff.length} Pending
            </Badge>
          )}
        </div>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList>
          <TabsTrigger value="all">All Ward Staff ({totalRoster})</TabsTrigger>
          <TabsTrigger value="registered">Registered ({activeStaff.length})</TabsTrigger>
          <TabsTrigger value="pending">Pending Invitations ({pendingStaff.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">All Ward Staff</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {totalRoster === 0 ? (
                <div className="flex flex-col items-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No staff yet.</p>
                </div>
              ) : (
                <>
                  {activeStaff.map(renderActiveRow)}
                  {pendingStaff.map(renderPendingRow)}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="registered" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("staff.activeStaff")} ({activeStaff.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {activeStaff.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">{t("staff.noActiveStaff")}</p>
                </div>
              ) : (
                <div className="space-y-2">{activeStaff.map(renderActiveRow)}</div>
              )}
              {inactiveProfiles.length > 0 && (
                <div className="mt-6 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Deactivated profiles</p>
                  {inactiveProfiles.map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between rounded-lg border border-muted bg-muted/30 p-3">
                      <div>
                        <p className="text-sm font-medium">{m.full_name || "Unnamed"}</p>
                        <p className="text-xs text-muted-foreground">{m.roles?.join(", ") || "nurse"}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(m)}>
                          <Pencil className="me-1 h-3 w-3" /> {t("staff.edit")}
                        </Button>
                        <Button size="sm" onClick={() => setActivateConfirm(m)}>
                          <UserCheck className="me-1 h-3 w-3" /> {t("staff.activate")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                Pending Invitations ({pendingStaff.length})
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Imported staff who haven't signed up yet. They are still schedulable from the Master Roster.
              </p>
            </CardHeader>
            <CardContent>
              {pendingStaff.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-muted-foreground">
                  <UserCheck className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">All imported staff have signed up.</p>
                </div>
              ) : (
                <div className="space-y-2">{pendingStaff.map(renderPendingRow)}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Staff Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={editForm.full_name} onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={editForm.role} onValueChange={(v) => setEditForm((f) => ({ ...f, role: v as AppRole }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nurse">Nurse</SelectItem>
                    <SelectItem value="assistant">Assistant</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>FTE %</Label>
                <Input
                  type="number"
                  min={10}
                  max={100}
                  step={10}
                  value={editForm.target_fte_percent * 100}
                  onChange={(e) => setEditForm((f) => ({ ...f, target_fte_percent: Number(e.target.value) / 100 }))}
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium">Qualifications</Label>
              <div className="flex items-center justify-between">
                <span className="text-sm">Can be Responsible Nurse</span>
                <Switch checked={editForm.is_responsible} onCheckedChange={(v) => setEditForm((f) => ({ ...f, is_responsible: v }))} />
              </div>
              {isManager && (
                <div className="flex items-center justify-between">
                  <span className="text-sm">Assistant Manager</span>
                  <Switch checked={editForm.is_assistant_manager} onCheckedChange={(v) => setEditForm((f) => ({ ...f, is_assistant_manager: v }))} />
                </div>
              )}
            </div>

            {/* Work Exclusions */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Work Exclusions</Label>
              <p className="text-xs text-muted-foreground">Tap to exclude shifts or days. Assignments to excluded slots trigger a hard friction warning.</p>

              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">Shift Types</span>
                <div className="flex gap-2">
                  {SHIFT_TYPES.map((type) => {
                    const excluded = editForm.excluded_shifts.includes(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => toggleExcludedShift(type)}
                        className={`flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                          excluded
                            ? "bg-destructive/10 border-destructive/30 text-destructive"
                            : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        {excluded && <X className="h-3.5 w-3.5" />}
                        {SHIFT_LABELS[type]} ({type.charAt(0).toUpperCase() + type.slice(1)})
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">Weekdays</span>
                <div className="flex gap-1">
                  {DAY_LABELS.map((label, idx) => {
                    const excluded = editForm.excluded_days.includes(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleExcludedDay(idx)}
                        title={DAY_NAMES[idx]}
                        className={`w-9 h-9 rounded-md border text-sm font-medium transition-colors flex items-center justify-center ${
                          excluded
                            ? "bg-destructive/10 border-destructive/30 text-destructive"
                            : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        {excluded ? <X className="h-3.5 w-3.5" /> : label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setEditDialog(false)}>Cancel</Button>
              <Button onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending}>
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Activate confirmation */}
      <AlertDialog open={!!activateConfirm} onOpenChange={(open) => !open && setActivateConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Activation</AlertDialogTitle>
            <AlertDialogDescription>
              This will grant <strong>{activateConfirm?.full_name || "this user"}</strong> access to the ward roster and dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (activateConfirm) {
                toggleActive.mutate({ id: activateConfirm.id, isActive: true });
                setActivateConfirm(null);
              }
            }}>
              Activate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
