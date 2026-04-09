import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { UserCheck, UserX } from "lucide-react";

export default function Staff() {
  const queryClient = useQueryClient();

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
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: isActive })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-management"] });
      toast.success("Staff status updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const pendingStaff = staff.filter((s) => !s.is_active);
  const activeStaff = staff.filter((s) => s.is_active);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Staff Management</h1>

      {pendingStaff.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Pending Activation ({pendingStaff.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingStaff.map((member) => (
                <div key={member.id} className="flex items-center justify-between rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                  <div>
                    <p className="text-sm font-medium">{member.full_name || "Unnamed"}</p>
                    <p className="text-xs text-muted-foreground">
                      {(member.user_roles as any[])?.map((r: any) => r.role).join(", ") || "nurse"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => toggleActive.mutate({ id: member.id, isActive: true })}
                  >
                    <UserCheck className="mr-1 h-4 w-4" />
                    Activate
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active Staff ({activeStaff.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {activeStaff.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active staff yet.</p>
          ) : (
            <div className="space-y-2">
              {activeStaff.map((member) => (
                <div key={member.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{member.full_name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {(member.user_roles as any[])?.map((r: any) => (
                        <Badge key={r.role} variant="outline" className="text-xs capitalize">
                          {r.role}
                        </Badge>
                      ))}
                      <span className="text-xs text-muted-foreground">
                        {(member.target_fte_percent * 100).toFixed(0)}% FTE
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => toggleActive.mutate({ id: member.id, isActive: false })}
                  >
                    <UserX className="mr-1 h-4 w-4" />
                    Deactivate
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
