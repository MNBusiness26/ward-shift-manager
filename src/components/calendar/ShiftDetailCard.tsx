import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Sun, Sunset, Moon, Star, Users, ShieldCheck, CheckCircle2, PhoneCall } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "@/i18n/useTranslation";

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
    is_verified?: boolean;
    is_standby?: boolean;
    actual_start_time?: string | null;
    actual_end_time?: string | null;
  };
  myRole: string;
  colleagues: Colleague[];
}

export function ShiftDetailCard({ shift, myRole, colleagues }: ShiftDetailCardProps) {
  const Icon = shiftIcons[shift.type] || Sun;
  const colors = shiftColorClass[shift.type] || shiftColorClass.morning;
  const { isManager } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const verifyMutation = useMutation({
    mutationFn: async (verified: boolean) => {
      const payload: any = { is_verified: verified };
      if (verified) {
        // Save scheduled times as the actuals (manager confirms shift ran as scheduled)
        payload.actual_start_time = shift.start_time?.slice(0, 5);
        payload.actual_end_time = shift.end_time?.slice(0, 5);
      }
      const { error } = await supabase.from("shifts").update(payload).eq("id", shift.id);
      if (error) throw error;
    },
    onSuccess: (_d, verified) => {
      queryClient.invalidateQueries();
      toast.success(verified ? t("payroll.verifiedToast") : t("payroll.unverifiedToast"));
    },
    onError: (e: any) => toast.error(e.message),
  });

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

      {isManager && !shift.is_draft && (
        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="font-medium">{t("payroll.verifyToggleLabel")}</span>
          </div>
          <Switch
            checked={!!shift.is_verified}
            disabled={verifyMutation.isPending}
            onCheckedChange={(v) => verifyMutation.mutate(v)}
          />
        </div>
      )}
    </div>
  );
}
