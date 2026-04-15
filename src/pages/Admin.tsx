import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Shield, Save, UserPlus, Trash2, Check, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState, useEffect } from "react";

const ADMIN_EMAIL = "michael.nejman@gmail.com";

export default function Admin() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const [enforceFullWeek, setEnforceFullWeek] = useState(true);
  const [greetingFormat, setGreetingFormat] = useState<"formal" | "first_name">("formal");
  const [greetingTemplate, setGreetingTemplate] = useState("");
  const [morningLimit, setMorningLimit] = useState(6);
  const [eveningLimit, setEveningLimit] = useState(4);
  const [nightLimit, setNightLimit] = useState(3);

  // Staff directory form state
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<string>("nurse");
  const [newFte, setNewFte] = useState("100");

  const { data: settings = [] } = useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: directory = [] } = useQuery({
    queryKey: ["staff-directory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_directory")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const efwSetting = settings.find((s: any) => s.key === "enforce_full_week");
    if (efwSetting) setEnforceFullWeek(efwSetting.value === "true" || efwSetting.value === true);

    const gfSetting = settings.find((s: any) => s.key === "greeting_format");
    if (gfSetting) setGreetingFormat(gfSetting.value === "first_name" ? "first_name" : "formal");

    const gtSetting = settings.find((s: any) => s.key === "greeting_template");
    if (gtSetting && typeof gtSetting.value === "string") setGreetingTemplate(gtSetting.value);

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
      // Upsert: try update, if no rows affected, insert
      const { data: existing } = await supabase.from("app_settings").select("id").eq("key", key).maybeSingle();
      if (existing) {
        const { error } = await supabase
          .from("app_settings")
          .update({ value, updated_at: new Date().toISOString(), updated_by: user.id })
          .eq("key", key);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("app_settings")
          .insert({ key, value, updated_by: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app-settings"] });
      toast.success("Setting saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addStaff = useMutation({
    mutationFn: async () => {
      const fteDecimal = Math.max(0, Math.min(100, Number(newFte))) / 100;
      const { error } = await supabase.from("staff_directory").insert({
        full_name: newName.trim(),
        email: newEmail.trim().toLowerCase(),
        app_role: newRole as any,
        target_fte_percent: fteDecimal,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-directory"] });
      toast.success("Staff member added to directory");
      setNewName("");
      setNewEmail("");
      setNewRole("nurse");
      setNewFte("100");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff_directory").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-directory"] });
      toast.success("Entry removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const { error } = await supabase
        .from("staff_directory")
        .update({ app_role: role as any })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-directory"] });
      toast.success("Role updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleToggleFullWeek = (checked: boolean) => {
    setEnforceFullWeek(checked);
    saveSetting.mutate({ key: "enforce_full_week", value: checked ? "true" : "false" });
  };

  const handleToggleGreetingFormat = (checked: boolean) => {
    const val = checked ? "first_name" : "formal";
    setGreetingFormat(val);
    saveSetting.mutate({ key: "greeting_format", value: val });
  };

  const handleSaveGreetingTemplate = () => {
    saveSetting.mutate({ key: "greeting_template", value: greetingTemplate });
  };

  const handleSaveHeadcounts = () => {
    saveSetting.mutate({
      key: "headcount_limits",
      value: { morning: morningLimit, evening: eveningLimit, night: nightLimit },
    });
  };

  const handleAddStaff = () => {
    if (!newName.trim() || !newEmail.trim()) {
      toast.error("Name and email are required");
      return;
    }
    addStaff.mutate();
  };

  const roleLabel = (r: string) => r.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const templateVars = ["{{title}}", "{{first_name}}", "{{last_name}}"];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Shield className="h-6 w-6" />
        Admin Settings
      </h1>

      {/* Staff Directory */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Staff Directory (Pre-Seed)
          </CardTitle>
          <CardDescription>
            Add staff members before they sign up. When they register with the matching email, their account will be automatically linked with the correct role and FTE.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <Label className="text-xs">Full Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="jane@hospital.com" type="email" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nurse">Nurse</SelectItem>
                  <SelectItem value="assistant">Assistant</SelectItem>
                  <SelectItem value="assistant_manager">Assistant Manager</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">FTE %</Label>
              <Input type="number" min={10} max={100} step={5} value={newFte} onChange={(e) => setNewFte(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button onClick={handleAddStaff} disabled={addStaff.isPending} className="w-full gap-1">
                <UserPlus className="h-4 w-4" />
                Add
              </Button>
            </div>
          </div>

          {directory.length > 0 && (
            <div className="rounded-lg border">
              <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-2 border-b bg-muted/50 p-2 text-xs font-medium text-muted-foreground">
                <span>Name</span>
                <span>Email</span>
                <span>Role</span>
                <span>FTE</span>
                <span></span>
              </div>
              {directory.map((entry: any) => (
                <div key={entry.id} className="grid grid-cols-[1fr_1fr_auto_auto_auto] items-center gap-2 border-b last:border-0 p-2 text-sm">
                  <span className="truncate">{entry.full_name}</span>
                  <span className="truncate text-muted-foreground">{entry.email}</span>
                  {entry.is_claimed ? (
                    <Badge variant="default" className="text-xs">
                      {roleLabel(entry.app_role)}
                    </Badge>
                  ) : (
                    <Select value={entry.app_role} onValueChange={(v) => updateRole.mutate({ id: entry.id, role: v })}>
                      <SelectTrigger className="h-7 w-[140px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nurse">Nurse</SelectItem>
                        <SelectItem value="assistant">Assistant</SelectItem>
                        <SelectItem value="assistant_manager">Assistant Manager</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <span className="text-xs text-muted-foreground">{Math.round(entry.target_fte_percent * 100)}%</span>
                  <div className="flex items-center gap-1">
                    {entry.is_claimed ? (
                      <Check className="h-4 w-4 text-success" />
                    ) : (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeEntry.mutate(entry.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Operational Toggles */}
      <Card className="shadow-md">
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
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="text-sm font-medium">Dashboard Greeting: First Name Only</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                When active, the dashboard shows "Hello, Jane" instead of "Hello, Nurse Jane Doe". Overridden by custom template below.
              </p>
            </div>
            <Switch checked={greetingFormat === "first_name"} onCheckedChange={handleToggleGreetingFormat} />
          </div>
        </CardContent>
      </Card>

      {/* Greeting Template */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Dashboard Greeting Template</CardTitle>
          <CardDescription>
            Customize the dashboard greeting using template variables. Leave empty to use the default toggle above.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-sm">Greeting Template</Label>
            <Input
              value={greetingTemplate}
              onChange={(e) => setGreetingTemplate(e.target.value)}
              placeholder="e.g. Shalom, {{title}} {{last_name}}"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-muted-foreground">Available variables:</span>
            {templateVars.map((v) => (
              <Badge
                key={v}
                variant="secondary"
                className="text-xs cursor-pointer hover:bg-primary/10"
                onClick={() => setGreetingTemplate((prev) => prev + " " + v)}
              >
                {v}
              </Badge>
            ))}
          </div>
          <Button onClick={handleSaveGreetingTemplate} className="gap-2">
            <Save className="h-4 w-4" />
            Save Template
          </Button>
        </CardContent>
      </Card>

      {/* Headcount Limits */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Target Headcount Limits</CardTitle>
          <CardDescription>
            Maximum number of non-on-call staff per shift type. Exceeding triggers a yellow warning.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-sm">Morning Max</Label>
              <Input type="number" min={1} max={20} value={morningLimit} onChange={(e) => setMorningLimit(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Evening Max</Label>
              <Input type="number" min={1} max={20} value={eveningLimit} onChange={(e) => setEveningLimit(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Night Max</Label>
              <Input type="number" min={1} max={20} value={nightLimit} onChange={(e) => setNightLimit(Number(e.target.value))} />
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
