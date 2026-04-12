import { useState, useEffect } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle } from "lucide-react";

export interface FrictionWarning {
  type: "fte" | "role_rule";
  message: string;
}

interface FrictionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warnings: FrictionWarning[];
  onConfirm: () => void;
  isPending?: boolean;
}

export function FrictionDialog({ open, onOpenChange, warnings, onConfirm, isPending }: FrictionDialogProps) {
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (open) setChecked({});
  }, [open]);

  const allChecked = warnings.every((_, i) => checked[i]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Override Required
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 pt-2">
              {warnings.map((w, i) => (
                <div key={i} className="rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{w.message}</p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={!!checked[i]}
                      onCheckedChange={(v) => setChecked((prev) => ({ ...prev, [i]: !!v }))}
                    />
                    <span className="text-sm text-foreground">
                      {w.type === "fte"
                        ? "I agree to override this FTE limit."
                        : "I agree to override this policy."}
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={!allChecked || isPending}>
            {isPending ? "Saving…" : "Override & Save"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
