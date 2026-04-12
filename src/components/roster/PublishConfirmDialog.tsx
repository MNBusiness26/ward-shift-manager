import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ChevronDown, ChevronUp, Eye } from "lucide-react";
import { format } from "date-fns";

interface ShiftInfo {
  id: string;
  date: string;
  type: string;
  start_time: string;
  end_time: string;
  is_responsible_on_shift: boolean;
  is_draft: boolean;
  assigned_user_id: string | null;
  profiles?: { full_name: string } | null;
}

interface PublishConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drafts: ShiftInfo[];
  allShifts: ShiftInfo[];
  onConfirm: () => void;
  isPending: boolean;
}

export function PublishConfirmDialog({
  open,
  onOpenChange,
  drafts,
  allShifts,
  onConfirm,
  isPending,
}: PublishConfirmDialogProps) {
  const [expanded, setExpanded] = useState(false);

  // After publish, all current drafts become published. Check which shifts will lack a responsible nurse.
  // Group all shifts (including soon-to-be-published drafts) by date+type, find groups missing responsible.
  const allAfterPublish = allShifts.map((s) =>
    s.is_draft ? { ...s, is_draft: false } : s
  );

  const grouped: Record<string, ShiftInfo[]> = {};
  for (const s of allAfterPublish) {
    if (!s.assigned_user_id) continue;
    const key = `${s.date}|${s.type}`;
    (grouped[key] = grouped[key] || []).push(s);
  }

  const missingResponsible = Object.entries(grouped)
    .filter(([, shifts]) => !shifts.some((s) => s.is_responsible_on_shift))
    .map(([key, shifts]) => {
      const [date, type] = key.split("|");
      return { date, type, shifts };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));

  const hasWarnings = missingResponsible.length > 0;

  const shiftLabels: Record<string, string> = { morning: "Morning", evening: "Evening", night: "Night" };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Publish {drafts.length} Draft{drafts.length > 1 ? "s" : ""}?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                This will make {drafts.length} draft shift{drafts.length > 1 ? "s" : ""} visible to all staff on their calendars and dashboards.
              </p>

              {hasWarnings && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    {missingResponsible.length} shift group{missingResponsible.length > 1 ? "s" : ""} missing a Responsible Nurse
                  </div>
                  <p className="text-xs text-muted-foreground">
                    You can still publish, but these shifts won't have a designated responsible nurse.
                  </p>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs w-full justify-center"
                    onClick={() => setExpanded(!expanded)}
                  >
                    {expanded ? (
                      <>Hide details <ChevronUp className="ml-1 h-3 w-3" /></>
                    ) : (
                      <>Show {missingResponsible.length} affected shift{missingResponsible.length > 1 ? "s" : ""} <ChevronDown className="ml-1 h-3 w-3" /></>
                    )}
                  </Button>

                  {expanded && (
                    <div className="max-h-48 overflow-y-auto space-y-1.5 pt-1">
                      {missingResponsible.map(({ date, type, shifts }) => (
                        <div
                          key={`${date}-${type}`}
                          className="flex items-center justify-between rounded border px-2.5 py-1.5 text-xs bg-background"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {format(new Date(date + "T00:00"), "EEE, MMM d")}
                            </span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {shiftLabels[type] || type}
                            </Badge>
                          </div>
                          <span className="text-muted-foreground">
                            {shifts.map((s) => (s as any).profiles?.full_name?.split(" ")[0] || "?").join(", ")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Keep Editing</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isPending}>
            {isPending ? "Publishing…" : hasWarnings ? "Publish Anyway" : "Publish"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
