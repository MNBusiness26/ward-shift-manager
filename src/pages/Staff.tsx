import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { UserCheck, UserX, Pencil, Users, Clock, Shield } from "lucide-react";
import { useState } from "react";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

export default function Staff() {
  const queryClient = useQueryClient();
  const [editDialog, setEditDialog] = useState(false);
  const [editMember, setEditMember] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    full_name: "",
    target_fte_percent: 1,
    role: "nurse" as AppRole,
    no_nights: false,
    no_weekends: false,
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
      };
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: editForm.full_name,
          target_fte_percent: editForm.target_fte_percent,
          constraints,
        })
        .eq("id", editMember.id);
      if (error) throw error;

      // Update role if changed
      const currentRole = editMember.roles?.[0];
      if (currentRole !== editForm.role) {
        if (currentRole) {
          await supabase.from("user_roles").delete().eq("user_id", editMember.id).eq("role", currentRole);
        }
        await supabase.from("user_roles").insert({ user_id: editMember.id, role: editForm.role });
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
      no_nights: !!(constraints as any).no_nights,
      no_weekends: !!(constraints as any).no_weekends,
    });
    setEditDialog(true);
  };

  const pendingStaff = staff.filter((s) => !s.is_active);
  const activeStaff = staff.filter((s) => s.is_active);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Staff Management</h1>
        <div className="flex gap-2">
          <Badge variant="outline">
            <Users className="mr-1 h-3 w-3" />
            {activeStaff.length} active
          </Badge>
          {pendingStaff.length > 0 && (
            <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">
              <Clock className="mr-1 h-3 w-3" />
              {pendingStaff.length} pending
            </Badge>
          )}
        </div>
      </div>

      {pendingStaff.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-600" />
              Pending Activation ({pendingStaff.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingStaff.map((member) => (
                <div key={member.id} className="flex items-center justify-between rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                  <div>
                    <p className="text-sm font-medium">{member.full_name || "Unnamed"}</p>
                    <p className="text-xs text-muted-foreground">{member.roles?.join(", ") || "nurse"}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(member)}>
                      <Pencil className="mr-1 h-3 w-3" />
                      Edit
                    </Button>
                    <Button size="sm" onClick={() => toggleActive.mutate({ id: member.id, isActive: true })}>
                      <UserCheck className="mr-1 h-3 w-3" />
                      Activate
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Active Staff ({activeStaff.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {activeStaff.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-muted-foreground">
              <Users className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No active staff yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeStaff.map((member) => {
                const constraints = typeof member.constraints === "object" && member.constraints !== null ? member.constraints : {};
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
                        {(constraints as any)?.no_nights && (
                          <Badge variant="outline" className="text-[10px] bg-muted">No nights</Badge>
                        )}
                        {(constraints as any)?.no_weekends && (
                          <Badge variant="outline" className="text-[10px] bg-muted">No weekends</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
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
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
              <Label className="text-sm font-medium">Constraints</Label>
              <div className="flex items-center justify-between">
                <span className="text-sm">No Night Shifts</span>
                <Switch checked={editForm.no_nights} onCheckedChange={(v) => setEditForm((f) => ({ ...f, no_nights: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">No Weekend Shifts</span>
                <Switch checked={editForm.no_weekends} onCheckedChange={(v) => setEditForm((f) => ({ ...f, no_weekends: v }))} />
              </div>
            </div>

            <Button className="w-full" onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending}>
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
