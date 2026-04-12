import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Shield, Save } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState, useEffect } from "react";

const ADMIN_EMAIL = "michael.nejman@gmail.com";

export default function Admin() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const [enforceFullWeek, setEnforceFullWeek] = useState(true);
  const [morningLimit, setMorningLimit] = useState(4);
  const [eveningLimit, setEveningLimit] = useState(3);
  const [nightLimit, setNightLimit] = useState(2);

  const { data: settings = [] } = useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*");
      if (error) throw error;
      return data;
    },
  });

  // Sync local state from DB
  useEffect(() => {
    const efwSetting = settings.find((s: any) => s.key === "enforce_full_week");
    if (efwSetting) setEnforceFullWeek(efwSetting.value === "true" || efwSetting.value === true);

    const hcSetting = settings.find((s: any) => s.key === "headcount_limits");
    if (hcSetting && typeof hcSetting.value === "object") {
      const v = hcSetting.value as any;
      if (v.morning != null) setMorningLimit(v.morning);
      if (v.evening != null) setEveningLimit(v.evening);
      if (v.night != null) setNightLimit(v.night);
    }
  }, [settings]);

  if (!user || profile?.email !== ADMIN_EMAIL) {
    return <Navigate to="/" replace />;
  }

  const saveSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      const { error } = await supabase
        .from("app_settings")
        .update({ value, updated_at: new Date().toISOString(), updated_by: user.id })
        .eq("key", key);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app-settings"] });
      toast.success("Setting saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleToggleFullWeek = (checked: boolean) => {
    setEnforceFullWeek(checked);
    saveSetting.mutate({ key: "enforce_full_week", value: checked ? "true" : "false" });
  };

  const handleSaveHeadcounts = () => {
    saveSetting.mutate({
      key: "headcount_limits",
      value: { morning: morningLimit, evening: eveningLimit, night: nightLimit },
    });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Shield className="h-6 w-6" />
        Admin Settings
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Operational Toggles</CardTitle>
          <CardDescription>Global settings that affect roster operations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="text-sm font-medium">Enforce Full Week Operations</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                When active, "Publish" and "Clear" buttons on the Roster are disabled unless viewing a full Sun–Sat week.
              </p>
            </div>
            <Switch checked={enforceFullWeek} onCheckedChange={handleToggleFullWeek} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Target Headcount Limits</CardTitle>
          <CardDescription>
            Maximum number of non-standby staff per shift type. Exceeding triggers a yellow warning.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-sm">Morning Max</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={morningLimit}
                onChange={(e) => setMorningLimit(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Evening Max</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={eveningLimit}
                onChange={(e) => setEveningLimit(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Night Max</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={nightLimit}
                onChange={(e) => setNightLimit(Number(e.target.value))}
              />
            </div>
          </div>
          <Button onClick={handleSaveHeadcounts} className="gap-2">
            <Save className="h-4 w-4" />
            Save Headcount Limits
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
