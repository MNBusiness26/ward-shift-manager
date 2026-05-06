import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ROLE_OPTIONS, getRoleLabel } from "@/lib/roles";
import { useTranslation } from "@/i18n/useTranslation";

interface Props {
  entry: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditDirectoryDialog({ entry, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const { locale } = useTranslation();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("nurse");
  const [fte, setFte] = useState("100");

  useEffect(() => {
    if (entry) {
      setFullName(entry.full_name || "");
      setEmail(entry.email || "");
      setRole(entry.app_role || "nurse");
      setFte(String(Math.round((entry.target_fte_percent ?? 1) * 100)));
    }
  }, [entry]);

  const save = useMutation({
    mutationFn: async () => {
      if (!entry) return;
      const fteDecimal = Math.max(0, Math.min(100, Number(fte))) / 100;
      const { error } = await supabase
        .from("staff_directory")
        .update({
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          app_role: role as any,
          target_fte_percent: fteDecimal,
        })
        .eq("id", entry.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-directory"] });
      toast.success("Staff member updated");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={locale === "he" ? "rtl" : "ltr"} style={{ lineHeight: 1.5 }}>
        <DialogHeader>
          <DialogTitle className="font-medium">Edit Staff Member</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Full Name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="min-h-[44px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="min-h-[44px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>{getRoleLabel(r, locale)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">FTE %</Label>
            <Input type="number" min={10} max={100} step={5} value={fte} onChange={(e) => setFte(e.target.value)} className="min-h-[44px]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
