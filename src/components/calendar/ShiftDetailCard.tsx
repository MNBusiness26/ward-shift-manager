import { Badge } from "@/components/ui/badge";
import { Sun, Sunset, Moon, Star, Users } from "lucide-react";

const shiftIcons: Record<string, React.ElementType> = { morning: Sun, evening: Sunset, night: Moon };
const shiftLabels: Record<string, string> = { morning: "Morning", evening: "Evening", night: "Night" };

const shiftColorClass: Record<string, { bg: string; border: string; icon: string }> = {
  morning: { bg: "bg-shift-morning/10", border: "border-s-2 border-s-shift-morning", icon: "text-shift-morning" },
  evening: { bg: "bg-shift-evening/10", border: "border-s-2 border-s-shift-evening", icon: "text-shift-evening" },
  night: { bg: "bg-shift-night/10", border: "border-s-2 border-s-shift-night", icon: "text-shift-night" },
};

interface Colleague {
  id: string;
  is_responsible_on_shift: boolean;
  profiles?: any;
}

interface ShiftDetailCardProps {
  shift: {
    id: string;
    type: string;
    start_time: string;
    end_time: string;
    is_responsible_on_shift: boolean;
    is_draft: boolean;
    comments: string | null;
  };
  myRole: string;
  colleagues: Colleague[];
}

export function ShiftDetailCard({ shift, myRole, colleagues }: ShiftDetailCardProps) {
  const Icon = shiftIcons[shift.type] || Sun;
  const colors = shiftColorClass[shift.type] || shiftColorClass.morning;

  return (
    <div className={`relative rounded-lg p-4 space-y-3 ${colors.bg} ${colors.border} ${shift.is_draft ? "border-dashed" : ""}`}>
      {shift.is_responsible_on_shift && (
        <Star className="absolute top-3 end-3 h-4 w-4 fill-primary text-primary" />
      )}

      <div className="flex items-center justify-between pe-6">
        <div className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${colors.icon}`} />
          <span className={`font-medium ${colors.icon}`}>{shiftLabels[shift.type] || shift.type} Shift</span>
        </div>
        <span className="text-sm text-muted-foreground">
          {shift.start_time.slice(0, 5)} — {shift.end_time.slice(0, 5)}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="capitalize">{myRole}</Badge>
        {shift.is_draft && (
          <Badge variant="outline" className="opacity-60">Draft</Badge>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          Working with ({colleagues.length})
        </div>
        {colleagues.length === 0 ? (
          <p className="text-xs text-muted-foreground ps-5">No other staff on this shift.</p>
        ) : (
          <div className="space-y-1 ps-5">
            {colleagues.map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-sm">
                <span>{c.profiles?.full_name || "Unknown"}</span>
                {c.is_responsible_on_shift && (
                  <Star className="h-3 w-3 fill-primary text-primary" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {shift.comments && (
        <p className="text-xs text-muted-foreground border-t pt-2">{shift.comments}</p>
      )}
    </div>
  );
}
