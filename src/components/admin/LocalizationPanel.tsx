import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe2, RefreshCw, Plus, Trash2, Ban, Eye, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { DEFAULT_LOCALIZATION, type HolidayCategory, type LocalizationSettings, type PublicHoliday } from "@/hooks/useHolidays";

const CATEGORIES: { key: HolidayCategory; label: string }[] = [
  { key: "jewish", label: "Jewish (יהודי)" },
  { key: "muslim", label: "Muslim (מוסלמי)" },
  { key: "christian", label: "Christian (נוצרי)" },
  { key: "national", label: "National (Israel)" },
  { key: "ward", label: "Ward (מחלקה)" },
];

export function LocalizationPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Settings
  const { data: settingRow } = useQuery({
    queryKey: ["app-setting-row", "localization"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("*").eq("key", "localization").maybeSingle();
      return data;
    },
  });

  const [settings, setSettings] = useState<LocalizationSettings>(DEFAULT_LOCALIZATION);
  useEffect(() => {
    if (settingRow?.value) {
      const v = settingRow.value as any;
      setSettings({
        region: v.region || DEFAULT_LOCALIZATION.region,
        enabled_categories: { ...DEFAULT_LOCALIZATION.enabled_categories, ...(v.enabled_categories || {}) },
      });
    }
  }, [settingRow]);

  const saveSettings = useMutation({
    mutationFn: async (next: LocalizationSettings) => {
      if (settingRow?.id) {
        const { error } = await supabase
          .from("app_settings")
          .update({ value: next as any, updated_at: new Date().toISOString(), updated_by: user?.id })
          .eq("key", "localization");
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("app_settings")
          .insert({ key: "localization", value: next as any, updated_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-setting-row", "localization"] });
      qc.invalidateQueries({ queryKey: ["app-setting", "localization"] });
      toast.success("Localization saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateSettings = (next: LocalizationSettings) => {
    setSettings(next);
    saveSettings.mutate(next);
  };

  // Holidays list
  const { data: holidays = [] } = useQuery({
    queryKey: ["public-holidays-admin"],
    queryFn: async (): Promise<PublicHoliday[]> => {
      const { data, error } = await supabase
        .from("public_holidays")
        .select("*")
        .order("date", { ascending: true });
      if (error) throw error;
      return (data || []) as PublicHoliday[];
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("public_holidays").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["public-holidays-admin"] });
      qc.invalidateQueries({ queryKey: ["public-holidays"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeHoliday = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("public_holidays").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["public-holidays-admin"] });
      qc.invalidateQueries({ queryKey: ["public-holidays"] });
      toast.success("Removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Manual sync
  const [syncing, setSyncing] = useState(false);
  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-holidays", { body: {} });
      if (error) throw error;
      toast.success(`Synced ${data?.upserted ?? 0} holidays`);
      qc.invalidateQueries({ queryKey: ["public-holidays-admin"] });
      qc.invalidateQueries({ queryKey: ["public-holidays"] });
    } catch (e: any) {
      toast.error(e.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  // Add custom ward holiday
  const [newDate, setNewDate] = useState("");
  const [newNameHe, setNewNameHe] = useState("");
  const [newNameEn, setNewNameEn] = useState("");
  const [newCategory, setNewCategory] = useState<HolidayCategory>("ward");
  const [newIsEve, setNewIsEve] = useState(false);

  const addHoliday = useMutation({
    mutationFn: async () => {
      if (!newDate) throw new Error("Date is required");
      const { error } = await supabase.from("public_holidays").insert({
        date: newDate,
        name_he: newNameHe.trim() || newNameEn.trim() || "Holiday",
        name_en: newNameEn.trim() || newNameHe.trim() || "Holiday",
        category: newCategory,
        is_eve: newIsEve,
        is_active: true,
        source: "manual",
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["public-holidays-admin"] });
      qc.invalidateQueries({ queryKey: ["public-holidays"] });
      toast.success("Holiday added");
      setNewDate("");
      setNewNameHe("");
      setNewNameEn("");
      setNewIsEve(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const upcoming = holidays.filter((h) => h.date >= new Date().toISOString().slice(0, 10));
  const past = holidays.filter((h) => h.date < new Date().toISOString().slice(0, 10));

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe2 className="h-5 w-5" />
          <span style={{ fontFamily: "'Heebo', sans-serif", lineHeight: 1.5 }}>{t("admin.localization")}</span>
        </CardTitle>
        <CardDescription>
          Holiday calendar and regional overlays. Synced monthly from Hebcal for Israel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Region + Sync */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Region</Label>
            <Select
              value={settings.region}
              onValueChange={(v) => updateSettings({ ...settings, region: v })}
            >
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="IL">Israel</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSync} disabled={syncing} variant="outline" className="gap-2">
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Manual Sync"}
          </Button>
        </div>

        {/* Category toggles */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Visible Categories</Label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map((c) => (
              <div key={c.key} className="flex items-center justify-between rounded-md border p-3">
                <span className="text-sm">{c.label}</span>
                <Switch
                  checked={settings.enabled_categories[c.key]}
                  onCheckedChange={(checked) =>
                    updateSettings({
                      ...settings,
                      enabled_categories: { ...settings.enabled_categories, [c.key]: checked },
                    })
                  }
                />
              </div>
            ))}
          </div>
        </div>

        {/* Add custom holiday */}
        <div className="space-y-2 rounded-lg border p-3">
          <Label className="text-sm font-medium">Add Custom Holiday</Label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Name (Hebrew)</Label>
              <Input value={newNameHe} onChange={(e) => setNewNameHe(e.target.value)} placeholder="שם החג" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Name (English)</Label>
              <Input value={newNameEn} onChange={(e) => setNewNameEn(e.target.value)} placeholder="Holiday name" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={newCategory} onValueChange={(v) => setNewCategory(v as HolidayCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex items-center gap-2">
                <Switch checked={newIsEve} onCheckedChange={setNewIsEve} id="iseve" />
                <Label htmlFor="iseve" className="text-xs">Is Eve</Label>
              </div>
            </div>
            <div className="flex items-end">
              <Button onClick={() => addHoliday.mutate()} disabled={addHoliday.isPending} className="w-full gap-1">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
          </div>
        </div>

        {/* Holiday list */}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between gap-2">
              <span>
                Existing Holidays
                <span className="text-xs font-normal text-muted-foreground ms-2">({holidays.length})</span>
              </span>
              <ChevronDown className="h-4 w-4 transition-transform data-[state=open]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-2">
            <Label className="text-sm font-medium">
              Upcoming Holidays
              <span className="text-xs font-normal text-muted-foreground ms-2">({upcoming.length})</span>
            </Label>
            <div className="rounded-lg border max-h-[400px] overflow-auto">
              <div className="grid grid-cols-[100px_1fr_1fr_auto_auto_auto] gap-2 border-b bg-muted/50 p-2 text-xs font-medium text-muted-foreground sticky top-0">
                <span>Date</span>
                <span>English</span>
                <span>עברית</span>
                <span>Category</span>
                <span>Active</span>
                <span></span>
              </div>
              {[...upcoming, ...past].map((h) => (
                <div key={h.id} className={`grid grid-cols-[100px_1fr_1fr_auto_auto_auto] items-center gap-2 border-b last:border-0 p-2 text-sm ${!h.is_active ? "opacity-50" : ""}`}>
                  <span className="text-xs font-mono">{h.date}</span>
                  <span className="truncate">{h.name_en}{h.is_eve && <Badge variant="outline" className="ms-1 text-[9px]">eve</Badge>}</span>
                  <span className="truncate" dir="rtl">{h.name_he}</span>
                  <Badge variant="secondary" className="text-[10px]">{h.category}</Badge>
                  <Switch
                    checked={h.is_active}
                    onCheckedChange={(c) => toggleActive.mutate({ id: h.id, is_active: c })}
                  />
                  {h.source === "manual" ? (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeHoliday.mutate(h.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  ) : (
                    <span title={h.is_active ? "Synced — toggle to block" : "Blocked"} className="text-muted-foreground">
                      {h.is_active ? <Eye className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                    </span>
                  )}
                </div>
              ))}
              {holidays.length === 0 && (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  No holidays yet. Click <strong>Manual Sync</strong> above to fetch from Hebcal.
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
