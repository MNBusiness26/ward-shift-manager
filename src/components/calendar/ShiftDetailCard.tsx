import { Badge } from "@/components/ui/badge";
import { Sun, Sunset, Moon, Star, Users, CheckCircle2, PhoneCall } from "lucide-react";
import { useTranslation } from "@/i18n/useTranslation";

const shiftIcons: Record<string, React.ElementType> = { morning: Sun, evening: Sunset, night: Moon };

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
    is_verified?: boolean;
    is_standby?: boolean;
    is_external?: boolean;
    actual_start_time?: string | null;
    actual_end_time?: string | null;
  };
  myRole: string;
  colleagues: Colleague[];
}

export function ShiftDetailCard({ shift, colleagues }: ShiftDetailCardProps) {
  const Icon = shiftIcons[shift.type] || Sun;
  const colors = shiftColorClass[shift.type] || shiftColorClass.morning;
  const { t } = useTranslation();

  const shiftLabels: Record<string, string> = {
    morning: t("shift.morning"),
    evening: t("shift.evening"),
    night: t("shift.night"),
  };

  return (
    <div
      className={`relative rounded-lg p-4 space-y-3 leading-[1.5] ${
        shift.is_external
          ? `border-2 border-slate-300 ${shift.is_draft ? "bg-draft-stripes border-dashed" : "bg-slate-50"}`
          : shift.is_standby
          ? `border-2 border-blue-400 ${shift.is_draft ? "bg-draft-stripes border-dashed" : "bg-standby"}`
          : `${colors.border} ${shift.is_draft ? "bg-draft-stripes border-dashed" : colors.bg}`
      }`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Icon className={`h-5 w-5 ${colors.icon}`} />
          <span className={`font-medium ${colors.icon}`}>{shiftLabels[shift.type] || shift.type}</span>
          {shift.is_responsible_on_shift && (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
              <Star className="h-4 w-4 fill-primary text-primary" />
              {t("roster.responsibleNurse")}
            </span>
          )}
        </div>
        <span className="text-sm text-muted-foreground">
          {shift.start_time.slice(0, 5)} — {shift.end_time.slice(0, 5)}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {shift.is_draft && (
          <Badge variant="outline" className="opacity-60">Draft</Badge>
        )}
        {shift.is_standby && (
          <Badge variant="outline" className="gap-1">
            <PhoneCall className="h-3 w-3" /> {t("payroll.onCall")}
          </Badge>
        )}
        {shift.is_verified && (
          <Badge variant="outline" className="gap-1 border-green-600/40 text-green-700 dark:text-green-500">
            <CheckCircle2 className="h-3 w-3" /> {t("payroll.verified")}
          </Badge>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {t("shift.teamOnShift")} ({colleagues.length})
        </div>
        {colleagues.length === 0 ? (
          <p className="text-xs text-muted-foreground ps-5">—</p>
        ) : (
          <div className="space-y-1 ps-5">
            {colleagues.map((c) => {
              const isLead = !!c.is_responsible_on_shift;
              const isAssistantRole = c.profiles?.role === "assistant";
              return (
                <div
                  key={c.id}
                  className={`flex items-center gap-2 text-sm leading-[1.5] px-2 py-1 rounded ${
                    isAssistantRole ? "bg-white text-[#0F172A] border border-slate-300" : ""
                  } ${isLead ? "font-medium" : "font-normal"}`}
                >
                  <span>{c.profiles?.full_name || "Unknown"}</span>
                  {isLead && <Star className="h-3 w-3 fill-primary text-primary" />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {shift.comments && (
        <p className="text-xs text-muted-foreground border-t pt-2 leading-[1.5]">{shift.comments}</p>
      )}
    </div>
  );
}
