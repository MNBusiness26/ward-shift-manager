import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserCheck, Trash2, Inbox } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { format } from "date-fns";

type PendingUser = {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  has_profile: boolean;
};
type DirectoryEntry = {
  id: string;
  full_name: string;
  email: string;
  app_role: string;
};

async function callFn(action: string, body: Record<string, any> = {}) {
  const { data, error } = await supabase.functions.invoke("admin-pending-signups", {
    body: { action, ...body },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
}

export function PendingSignupsPanel() {
  const qc = useQueryClient();
  const [selectedDir, setSelectedDir] = useState<Record<string, string>>({});

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["pending-signups"],
    queryFn: async () => (await callFn("list")) as { pending: PendingUser[]; directory: DirectoryEntry[] },
  });

  const linkMut = useMutation({
    mutationFn: async ({ auth_user_id, directory_id }: { auth_user_id: string; directory_id: string }) =>
      callFn("link", { auth_user_id, directory_id }),
    onSuccess: () => {
      toast.success("Access granted — they can refresh now");
      qc.invalidateQueries({ queryKey: ["pending-signups"] });
      qc.invalidateQueries({ queryKey: ["staff-directory"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to grant access"),
  });

  const activateMut = useMutation({
    mutationFn: async (auth_user_id: string) => callFn("activate", { auth_user_id }),
    onSuccess: () => {
      toast.success("Account activated");
      qc.invalidateQueries({ queryKey: ["pending-signups"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const dismissMut = useMutation({
    mutationFn: async (auth_user_id: string) => callFn("dismiss", { auth_user_id }),
    onSuccess: () => {
      toast.success("User removed");
      qc.invalidateQueries({ queryKey: ["pending-signups"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const pending = data?.pending ?? [];
  const directory = data?.directory ?? [];

  return (
    <Card className="shadow-md border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Inbox className="h-5 w-5" />
          Pending Sign-ins
          {pending.length > 0 && (
            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
              {pending.length}
            </span>
          )}
        </CardTitle>
        <CardDescription>
          People who signed up but don't have access yet. Link them to a Staff Directory entry to grant access instantly.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending sign-ins. Everyone who signed up has access.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((u) => {
              const matching = directory.find((d) => d.email.toLowerCase() === u.email.toLowerCase());
              const chosen = selectedDir[u.id] ?? matching?.id ?? "";
              return (
                <div key={u.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <div className="font-medium">{u.full_name || u.email}</div>
                      <div className="text-xs text-muted-foreground">
                        {u.email} · signed up {format(new Date(u.created_at), "PP p")}
                        {u.has_profile && <> · profile exists (inactive)</>}
                      </div>
                    </div>
                  </div>

                  {u.has_profile ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => activateMut.mutate(u.id)}
                        disabled={activateMut.isPending}
                        className="gap-2"
                      >
                        <UserCheck className="h-4 w-4" /> Activate
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Remove ${u.email}? This deletes their account.`)) dismissMut.mutate(u.id);
                        }}
                        className="gap-2 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" /> Dismiss
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={chosen}
                        onValueChange={(v) => setSelectedDir((s) => ({ ...s, [u.id]: v }))}
                      >
                        <SelectTrigger className="w-[260px]">
                          <SelectValue placeholder="Link to Staff Directory entry…" />
                        </SelectTrigger>
                        <SelectContent>
                          {directory.length === 0 && (
                            <div className="p-2 text-xs text-muted-foreground">No unclaimed directory entries</div>
                          )}
                          {directory.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.full_name} — {d.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        disabled={!chosen || linkMut.isPending}
                        onClick={() => linkMut.mutate({ auth_user_id: u.id, directory_id: chosen })}
                        className="gap-2"
                      >
                        <UserCheck className="h-4 w-4" /> Grant access
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Remove ${u.email}? This deletes their account.`)) dismissMut.mutate(u.id);
                        }}
                        className="gap-2 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" /> Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
            <Button variant="outline" size="sm" onClick={() => refetch()}>Refresh</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
