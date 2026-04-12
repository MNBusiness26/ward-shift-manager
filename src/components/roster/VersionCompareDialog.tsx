import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle } from "lucide-react";

interface VersionDiff {
  staffName: string;
  type: "changed" | "added" | "removed";
  detail: string;
}

interface VersionCompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versionName: string;
  diffs: VersionDiff[];
  onConfirm: () => void;
  isPending: boolean;
}

export type { VersionDiff };

export function VersionCompareDialog({
  open,
  onOpenChange,
  versionName,
  diffs,
  onConfirm,
  isPending,
}: VersionCompareDialogProps) {
  const colorMap = {
    changed: "bg-amber-500/10 border-amber-500/30 text-amber-700",
    added: "bg-green-500/10 border-green-500/30 text-green-700",
    removed: "bg-red-500/10 border-red-500/30 text-red-700",
  };

  const labelMap = {
    changed: "Changed",
    added: "New",
    removed: "Removed",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Compare Version
          </DialogTitle>
          <DialogDescription>
            Version "<strong>{versionName}</strong>" contains{" "}
            <strong>{diffs.length}</strong> change{diffs.length !== 1 ? "s" : ""} compared to your current draft.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[300px]">
          <div className="space-y-1.5 pr-4">
            {diffs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No differences found.</p>
            ) : (
              diffs.map((d, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded border px-3 py-2 text-sm ${colorMap[d.type]}`}
                >
                  <span className="font-medium">{d.staffName}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs">{d.detail}</span>
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${colorMap[d.type]}`}>
                      {labelMap[d.type]}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isPending} variant="destructive">
            Confirm Overwrite
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
