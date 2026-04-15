import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock } from "lucide-react";

interface VerifyShiftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift: {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    type: string;
    actual_start_time?: string | null;
    actual_end_time?: string | null;
    is_verified?: boolean;
  } | null;
}

export function VerifyShiftDialog({ open, onOpenChange, shift }: VerifyShiftDialogProps) {
  const queryClient = useQueryClient();
  const [actualStart, setActualStart] = useState("");
  const [actualEnd, setActualEnd] = useState("");

  useEffect(() => {
    if (shift) {
      setActualStart(shift.actual_start_time || shift.start_time?.slice(0, 5) || "");
      setActualEnd(shift.actual_end_time || shift.end_time?.slice(0, 5) || "");
    }
  }, [shift]);

  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (!shift) return;
      const { error } = await supabase
        .from("shifts")
        .update({
          actual_start_time: actualStart,
          actual_end_time: actualEnd,
          is_verified: true,
        } as any)
        .eq("id", shift.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-stats-range"] });
      queryClient.invalidateQueries({ queryKey: ["staff-stats-agenda"] });
      toast.success("Shift verified successfully");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!shift) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Verify Shift — {shift.date}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Scheduled: {shift.start_time?.slice(0, 5)} — {shift.end_time?.slice(0, 5)}
            <span className="ms-2 capitalize">({shift.type})</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Actual Start</Label>
              <Input type="time" value={actualStart} onChange={(e) => setActualStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Actual End</Label>
              <Input type="time" value={actualEnd} onChange={(e) => setActualEnd(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => verifyMutation.mutate()} disabled={verifyMutation.isPending}>
              Confirm & Lock
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
