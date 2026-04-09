import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval } from "date-fns";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff, AlertTriangle, Plus, Pencil, Trash2, Copy } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type ShiftType = Database["public"]["Enums"]["shift_type"];

const shiftBg: Record<string, string> = {
  morning: "bg-shift-morning/20 border-shift-morning/40 text-shift-morning",
  evening: "bg-shift-evening/20 border-shift-evening/40 text-shift-evening",
  night: "bg-shift-night/20 border-shift-night/40 text-shift-night",
};

const shiftTimes: Record<ShiftType, { start: string; end: string }> = {
  morning: { start: "07:00", end: "15:00" },
  evening: { start: "15:00", end: "23:00" },
  night: { start: "23:00", end: "07:00" },
};

interface ShiftFormData {
  date: string;
  type: ShiftType;
  start_time: string;
  end_time: string;
  assigned_user_id: string;
  is_responsible_on_shift: boolean;
  manager_on_duty_id: string;
  comments: string;
  is_draft: boolean;
}

const defaultForm = (date?: string): ShiftFormData => ({
  date: date || format(new Date(), "yyyy-MM-dd"),
  type: "morning",
  start_time: "07:00",
  end_time: "15:00",
  assigned_user_id: "",
  is_responsible_on_shift: false,
  manager_on_duty_id: "",
  comments: "",
  is_draft: true,
});

export default function Roster() {
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<string | null>(null);
  const [form, setForm] = useState<ShiftFormData>(defaultForm());

  const { data: shifts = [] } = useQuery({
    queryKey: ["roster-shifts", format(weekStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*, profiles:assigned_user_id(full_name)")
        .gte("date", format(weekStart, "yyyy-MM-dd"))
        .lte("date", format(weekEnd, "yyyy-MM-dd"))
        .order("date")
        .order("start_time");
      if (error) throw error;
      return data;
    },
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["all-staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, is_active")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: managers = [] } = useQuery({
    queryKey: ["all-managers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "manager");
      if (error) throw error;
      return data?.map((r) => r.user_id) ?? [];
    },
  });

  const { data: blockedDates = [] } = useQuery({
    queryKey: ["approved-blocks", format(weekStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_requests")
        .select("user_id, date")
        .eq("status", "approved")
        .gte("date", format(weekStart, "yyyy-MM-dd"))
        .lte("date", format(weekEnd, "yyyy-MM-dd"));
      if (error) throw error;
      return data;
    },
  });

  const saveShift = useMutation({
    mutationFn: async () => {
      const payload = {
        date: form.date,
        type: form.type,
        start_time: form.start_time,
        end_time: form.end_time,
        assigned_user_id: form.assigned_user_id || null,
        is_responsible_on_shift: form.is_responsible_on_shift,
        manager_on_duty_id: form.manager_on_duty_id || null,
        comments: form.comments || null,
        is_draft: form.is_draft,
      };

      if (editingShift) {
        const { error } = await supabase.from("shifts").update(payload).eq("id", editingShift);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("shifts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster-shifts"] });
      setDialogOpen(false);
      setEditingShift(null);
      toast.success(editingShift ? "Shift updated" : "Shift created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteShift = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shifts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster-shifts"] });
      toast.success("Shift deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const publishDrafts = useMutation({
    mutationFn: async () => {
      const draftIds = shifts.filter((s) => s.is_draft).map((s) => s.id);
      if (draftIds.length === 0) return;
      const { error } = await supabase.from("shifts").update({ is_draft: false }).in("id", draftIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster-shifts"] });
      toast.success("Schedule published!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const copyWeek = useMutation({
    mutationFn: async () => {
      const nextWeekStart = addWeeks(weekStart, 1);
      const inserts = shifts.map((s) => {
        const dayOffset = days.findIndex((d) => format(d, "yyyy-MM-dd") === s.date);
        const newDate = format(addWeeks(new Date(s.date), 1), "yyyy-MM-dd");
        return {
          date: newDate,
          type: s.type,
          start_time: s.start_time,
          end_time: s.end_time,
          assigned_user_id: s.assigned_user_id,
          is_responsible_on_shift: s.is_responsible_on_shift,
          manager_on_duty_id: s.manager_on_duty_id,
          comments: s.comments,
          is_draft: true,
        };
      });
      if (inserts.length === 0) return;
      const { error } = await supabase.from("shifts").insert(inserts);
      if (error) throw error;
      setWeekStart(nextWeekStart);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster-shifts"] });
      toast.success("Week copied as drafts to next week");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openCreate = (date?: string) => {
    setEditingShift(null);
    setForm(defaultForm(date));
    setDialogOpen(true);
  };

  const openEdit = (shift: any) => {
    setEditingShift(shift.id);
    setForm({
      date: shift.date,
      type: shift.type,
      start_time: shift.start_time?.slice(0, 5),
      end_time: shift.end_time?.slice(0, 5),
      assigned_user_id: shift.assigned_user_id || "",
      is_responsible_on_shift: shift.is_responsible_on_shift,
      manager_on_duty_id: shift.manager_on_duty_id || "",
      comments: shift.comments || "",
      is_draft: shift.is_draft,
    });
    setDialogOpen(true);
  };

  const handleTypeChange = (type: ShiftType) => {
    setForm((f) => ({ ...f, type, start_time: shiftTimes[type].start, end_time: shiftTimes[type].end }));
  };

  const isBlocked = (userId: string, date: string) =>
    blockedDates.some((b) => b.user_id === userId && b.date === date);

  const draftCount = shifts.filter((s) => s.is_draft).length;
  const missingResponsible = shifts.filter((s) => !s.is_responsible_on_shift && !s.is_draft);

  const managerStaff = staff.filter((s) => managers.includes(s.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Master Roster</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => copyWeek.mutate()} disabled={copyWeek.isPending || shifts.length === 0}>
            <Copy className="mr-1 h-4 w-4" />
            Copy Week
          </Button>
          <Button size="sm" onClick={() => openCreate()}>
            <Plus className="mr-1 h-4 w-4" />
            Add Shift
          </Button>
          {draftCount > 0 && (
            <Button size="sm" onClick={() => publishDrafts.mutate()} disabled={publishDrafts.isPending}>
              <Eye className="mr-1 h-4 w-4" />
              Publish {draftCount} Draft{draftCount > 1 ? "s" : ""}
            </Button>
          )}
        </div>
      </div>

      {missingResponsible.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <span>{missingResponsible.length} published shift(s) missing a Responsible Nurse</span>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <Button variant="ghost" size="icon" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <CardTitle className="text-base">
            {format(weekStart, "MMM d")} — {format(weekEnd, "MMM d, yyyy")}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card p-2 text-left font-medium text-muted-foreground min-w-[140px]">Staff</th>
                {days.map((d) => (
                  <th key={d.toISOString()} className="min-w-[120px] p-2 text-center font-medium text-muted-foreground">
                    <div>{format(d, "EEE")}</div>
                    <div className="text-xs">{format(d, "MMM d")}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.id} className="border-t">
                  <td className="sticky left-0 z-10 bg-card p-2 font-medium">
                    <span className="truncate block max-w-[130px]">{member.full_name}</span>
                  </td>
                  {days.map((d) => {
                    const dateStr = format(d, "yyyy-MM-dd");
                    const dayShifts = shifts.filter(
                      (s) => s.assigned_user_id === member.id && s.date === dateStr
                    );
                    const blocked = isBlocked(member.id, dateStr);
                    return (
                      <td
                        key={d.toISOString()}
                        className={`p-1 text-center cursor-pointer hover:bg-accent/30 transition-colors ${blocked ? "bg-destructive/5" : ""}`}
                        onClick={() => {
                          if (dayShifts.length === 0) {
                            setEditingShift(null);
                            setForm({ ...defaultForm(dateStr), assigned_user_id: member.id });
                            setDialogOpen(true);
                          }
                        }}
                      >
                        {blocked && dayShifts.length === 0 && (
                          <span className="text-[10px] text-destructive">Blocked</span>
                        )}
                        {dayShifts.map((s) => (
                          <div
                            key={s.id}
                            onClick={(e) => { e.stopPropagation(); openEdit(s); }}
                            className={`mb-1 rounded border px-1.5 py-1 text-xs cursor-pointer hover:ring-1 hover:ring-primary/50 transition-all ${shiftBg[s.type]} ${
                              s.is_draft ? "opacity-60 border-dashed" : ""
                            }`}
                          >
                            <div className="flex items-center justify-center gap-0.5">
                              <span className="capitalize font-medium">{s.type.charAt(0)}</span>
                              {s.is_responsible_on_shift && (
                                <span className="text-[9px] font-bold bg-primary/20 text-primary rounded px-0.5">RN</span>
                              )}
                              {s.is_draft && <EyeOff className="h-2.5 w-2.5 opacity-60" />}
                            </div>
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Unassigned shifts row */}
              {shifts.some((s) => !s.assigned_user_id) && (
                <tr className="border-t bg-muted/30">
                  <td className="sticky left-0 z-10 bg-muted/30 p-2 font-medium text-muted-foreground italic">Unassigned</td>
                  {days.map((d) => {
                    const dateStr = format(d, "yyyy-MM-dd");
                    const unassigned = shifts.filter((s) => !s.assigned_user_id && s.date === dateStr);
                    return (
                      <td key={d.toISOString()} className="p-1 text-center">
                        {unassigned.map((s) => (
                          <div
                            key={s.id}
                            onClick={() => openEdit(s)}
                            className={`mb-1 rounded border px-1.5 py-1 text-xs cursor-pointer hover:ring-1 hover:ring-primary/50 ${shiftBg[s.type]} border-dashed`}
                          >
                            <span className="capitalize font-medium">{s.type.charAt(0)}</span>
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Shift create/edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingShift ? "Edit Shift" : "Create Shift"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => handleTypeChange(v as ShiftType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="morning">Morning</SelectItem>
                    <SelectItem value="evening">Evening</SelectItem>
                    <SelectItem value="night">Night</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input type="time" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Assign to Staff</Label>
              <Select value={form.assigned_user_id || "__unassigned__"} onValueChange={(v) => setForm((f) => ({ ...f, assigned_user_id: v === "__unassigned__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">Unassigned</SelectItem>
                  {staff.map((s) => {
                    const blocked = isBlocked(s.id, form.date);
                    return (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name} {blocked ? "⚠️ Blocked" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Manager on Duty</Label>
              <Select value={form.manager_on_duty_id || "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, manager_on_duty_id: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {managerStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label>Responsible Nurse</Label>
              <Switch checked={form.is_responsible_on_shift} onCheckedChange={(v) => setForm((f) => ({ ...f, is_responsible_on_shift: v }))} />
            </div>

            <div className="flex items-center justify-between">
              <Label>Draft</Label>
              <Switch checked={form.is_draft} onCheckedChange={(v) => setForm((f) => ({ ...f, is_draft: v }))} />
            </div>

            <div className="space-y-2">
              <Label>Comments</Label>
              <Textarea value={form.comments} onChange={(e) => setForm((f) => ({ ...f, comments: e.target.value }))} placeholder="Optional notes..." rows={2} />
            </div>

            <div className="flex gap-2 justify-end">
              {editingShift && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => { deleteShift.mutate(editingShift); setDialogOpen(false); }}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Delete
                </Button>
              )}
              <Button onClick={() => saveShift.mutate()} disabled={saveShift.isPending}>
                {editingShift ? "Update" : "Create"} Shift
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
