import { Badge } from "@/components/ui/badge";
import { Sun, Sunset, Moon, Star, Users } from "lucide-react";

const shiftIcons: Record<string, React.ElementType> = { morning: Sun, evening: Sunset, night: Moon };
const shiftLabels: Record<string, string> = { morning: "Morning", evening: "Evening", night: "Night" };

interface Colleague {
  id: string;
  is_responsible_on_shift: boolean;
  profiles?: { full_name: string; is_responsible: boolean | null } | null;
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

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          <span className="font-medium">{shiftLabels[shift.type] || shift.type} Shift</span>
        </div>
        <span className="text-sm text-muted-foreground">
          {shift.start_time.slice(0, 5)} — {shift.end_time.slice(0, 5)}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="capitalize">{myRole}</Badge>
        {shift.is_responsible_on_shift && (
          <Badge className="gap-1">
            <Star className="h-3 w-3 fill-current" />
            Responsible Nurse
          </Badge>
        )}
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
          <p className="text-xs text-muted-foreground pl-5">No other staff on this shift.</p>
        ) : (
          <div className="space-y-1 pl-5">
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
