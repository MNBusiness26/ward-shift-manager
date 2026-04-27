import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "@/i18n/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Languages, RotateCcw } from "lucide-react";
import translations from "@/i18n/translations.json";

type Locale = "en" | "he";

export default function AdminDictionary() {
  const { user, isManager } = useAuth();
  const { t, locale, setLocale, applyOverride, removeOverride } = useTranslation();
  const [editingLocale, setEditingLocale] = useState<Locale>(locale === "en" ? "he" : locale);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  if (!user) return <Navigate to="/auth" replace />;
  if (!isManager) return <Navigate to="/" replace />;

  const enDict = translations.en as Record<string, string>;
  const targetDict = (translations as Record<string, Record<string, string>>)[editingLocale] ?? {};

  const allKeys = useMemo(() => Object.keys(enDict).sort(), [enDict]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allKeys;
    return allKeys.filter(
      (k) => k.toLowerCase().includes(q) || (enDict[k] ?? "").toLowerCase().includes(q),
    );
  }, [allKeys, search, enDict]);

  const currentValue = (key: string): string => {
    if (drafts[key] !== undefined) return drafts[key];
    // Use live merged dict only when editing the active locale
    if (editingLocale === locale) return t(key);
    return targetDict[key] ?? "";
  };

  const handleSave = async (key: string) => {
    const value = currentValue(key);
    setSavingKey(key);
    const { error } = await supabase
      .from("translation_overrides")
      .upsert({ key, locale: editingLocale, value, updated_by: user.id }, { onConflict: "key,locale" });
    setSavingKey(null);
    if (error) {
      toast.error("Failed to save: " + error.message);
      return;
    }
    if (editingLocale === locale) applyOverride(key, value);
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    toast.success("Translation updated");
  };

  const handleReset = async (key: string) => {
    setSavingKey(key);
    const { error } = await supabase
      .from("translation_overrides")
      .delete()
      .eq("key", key)
      .eq("locale", editingLocale);
    setSavingKey(null);
    if (error) {
      toast.error("Failed to reset: " + error.message);
      return;
    }
    if (editingLocale === locale) removeOverride(key);
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    toast.success("Reset to default");
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Languages className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Translation Dictionary</h1>
          <p className="text-sm text-muted-foreground">
            Edit Hebrew (or other locale) values. Changes apply instantly app-wide.
          </p>
        </div>
      </div>

      <Card className="rounded-sm">
        <CardHeader>
          <CardTitle>Editor</CardTitle>
          <CardDescription>
            Showing {filtered.length} of {allKeys.length} keys
          </CardDescription>
          <div className="flex flex-wrap gap-2 pt-3">
            <Input
              placeholder="Search by key or English text…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm rounded-sm"
            />
            <div className="flex gap-1">
              {(["he", "en"] as Locale[]).map((loc) => (
                <Button
                  key={loc}
                  variant={editingLocale === loc ? "default" : "outline"}
                  size="sm"
                  className="rounded-sm"
                  onClick={() => {
                    setEditingLocale(loc);
                    setDrafts({});
                  }}
                >
                  {loc.toUpperCase()}
                </Button>
              ))}
              {locale !== editingLocale && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-sm"
                  onClick={() => setLocale(editingLocale)}
                >
                  Preview in {editingLocale.toUpperCase()}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[70vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#003366] hover:bg-[#003366]">
                  <TableHead className="text-white font-semibold w-[260px]">Key</TableHead>
                  <TableHead className="text-white font-semibold w-[280px]">English</TableHead>
                  <TableHead className="text-white font-semibold">
                    {editingLocale.toUpperCase()} Value
                  </TableHead>
                  <TableHead className="text-white font-semibold w-[200px] text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((key) => {
                  const isDirty = drafts[key] !== undefined;
                  const hasOverride =
                    editingLocale === locale
                      ? t(key) !== ((translations as Record<string, Record<string, string>>)[editingLocale]?.[key] ?? "")
                      : false;
                  return (
                    <TableRow key={key}>
                      <TableCell className="font-mono text-xs align-top pt-4">
                        <div className="flex items-center gap-1">
                          <span>{key}</span>
                          {hasOverride && (
                            <Badge variant="secondary" className="rounded-sm text-[10px]">
                              custom
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm align-top pt-4 text-muted-foreground">
                        {enDict[key]}
                      </TableCell>
                      <TableCell className="align-top pt-2">
                        <Input
                          value={currentValue(key)}
                          onChange={(e) =>
                            setDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                          dir={editingLocale === "he" ? "rtl" : "ltr"}
                          className="rounded-sm"
                        />
                      </TableCell>
                      <TableCell className="text-right align-top pt-2">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-sm"
                            disabled={savingKey === key}
                            onClick={() => handleReset(key)}
                            title="Reset to JSON default"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            className="rounded-sm bg-[#003366] hover:bg-[#002244] text-white"
                            disabled={savingKey === key || !isDirty}
                            onClick={() => handleSave(key)}
                          >
                            {savingKey === key ? "Saving…" : "Update"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                      No keys match your search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
