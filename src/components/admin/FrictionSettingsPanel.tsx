import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ShieldAlert, Save } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  DEFAULT_FRICTION_CONFIG,
  useFrictionConfig,
  type FrictionCheckKey,
  type FrictionConfig,
} from "@/hooks/useFrictionConfig";

const CHECK_LABELS: Record<FrictionCheckKey, { label: string; desc: string }> = {
  fte_weekly: { label: "FTE weekly limit", desc: "Warn when assigning past a staff member's weekly FTE cap." },
  excluded_shifts: { label: "Excluded shift types", desc: "Warn when assigning a shift type the staff member has excluded." },
  excluded_days: { label: "Excluded weekdays", desc: "Warn when assigning a weekday the staff member has excluded." },
  rest_period: { label: "Back-to-back rest", desc: "Warn when there is insufficient rest between two shifts." },
  headcount: { label: "Headcount over-staffing", desc: "Highlight cells exceeding the day-aware capacity target." },
};

export function FrictionSettingsPanel() {
  const remote = useFrictionConfig();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [config, setConfig] = useState<FrictionConfig>(DEFAULT_FRICTION_CONFIG);

  useEffect(() => {
    setConfig(remote);
  }, [remote]);

  const save = useMutation({
    mutationFn: async (value: FrictionConfig) => {
      const { data: existing } = await supabase
        .from("app_settings")
        .select("id")
        .eq("key", "friction_config")
        .maybeSingle();
      if (existing) {
        const { error } = await supabase
          .from("app_settings")
          .update({ value: value as any, updated_at: new Date().toISOString(), updated_by: user!.id })
          .eq("key", "friction_config");
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("app_settings")
          .insert({ key: "friction_config", value: value as any, updated_by: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-settings"] });
      qc.invalidateQueries({ queryKey: ["app-settings", "friction_config"] });
      toast.success("Friction settings saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateCheck = (key: FrictionCheckKey, patch: Partial<FrictionConfig["checks"][FrictionCheckKey]>) => {
    setConfig((c) => ({ ...c, checks: { ...c.checks, [key]: { ...c.checks[key], ...patch } } }));
  };

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5" />
          Friction & Validation
        </CardTitle>
        <CardDescription>
          Control which conflict and FTE checks are surfaced to managers. When master is off, violations are still
          recorded silently in the friction log.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Master controls */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Enable friction warnings</Label>
              <p className="text-xs text-muted-foreground">Master switch — when off, saves proceed without prompting.</p>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={(v) => setConfig((c) => ({ ...c, enabled: v }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Track silently when disabled</Label>
              <p className="text-xs text-muted-foreground">Always log to friction_log, even when warnings are off.</p>
            </div>
            <Switch
              checked={config.log_when_disabled}
              onCheckedChange={(v) => setConfig((c) => ({ ...c, log_when_disabled: v }))}
            />
          </div>
        </div>

        <Separator />

        {/* Per-check */}
        <div className="space-y-4">
          <Label className="text-base">Per-check controls</Label>
          {(Object.keys(CHECK_LABELS) as FrictionCheckKey[]).map((key) => {
            const meta = CHECK_LABELS[key];
            const c = config.checks[key];
            return (
              <div key={key} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{meta.label}</p>
                    <p className="text-xs text-muted-foreground">{meta.desc}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Select
                      value={c.severity}
                      onValueChange={(v) => updateCheck(key, { severity: v as "yellow" | "red" })}
                    >
                      <SelectTrigger className="w-28 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yellow">Yellow</SelectItem>
                        <SelectItem value="red">Red</SelectItem>
                      </SelectContent>
                    </Select>
                    <Switch
                      checked={c.enabled}
                      onCheckedChange={(v) => updateCheck(key, { enabled: v })}
                    />
                  </div>
                </div>
                {key === "rest_period" && (
                  <div className="flex items-center gap-2 pt-1">
                    <Label className="text-xs text-muted-foreground">Minimum rest hours</Label>
                    <Input
                      type="number"
                      min={1}
                      max={24}
                      className="w-20 h-8"
                      value={c.min_hours ?? 8}
                      onChange={(e) => updateCheck(key, { min_hours: Math.max(1, Number(e.target.value) || 8) })}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Separator />

        {/* Formula */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-base">Shifts per week at 100% FTE</Label>
            <p className="text-xs text-muted-foreground">Used to compute the weekly FTE cap (default: 5).</p>
          </div>
          <Input
            type="number"
            min={1}
            max={14}
            className="w-24"
            value={config.fte_shifts_per_week}
            onChange={(e) =>
              setConfig((c) => ({ ...c, fte_shifts_per_week: Math.max(1, Number(e.target.value) || 5) }))
            }
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={() => save.mutate(config)} disabled={save.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {save.isPending ? "Saving…" : "Save Friction Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
