import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Users, AlertTriangle, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useStaffPool } from "@/hooks/useStaffPool";
import { toast } from "sonner";
import { startOfMonth, endOfMonth, format, parseISO, getDay } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type ShiftType = Database["public"]["Enums"]["shift_type"];

const shiftTimes: Record<ShiftType, { start: string; end: string }> = {
  morning: { start: "07:00", end: "15:00" },
  evening: { start: "14:30", end: "23:00" },
  night: { start: "22:30", end: "07:00" },
};

// 8 hours per shift
const HOURS_PER_SHIFT = 8;
// ~22 working days × 8h = 176 hours/month at 100% FTE
const MONTHLY_HOURS_100_FTE = 176;

interface StaffMember {
  id: string;
  full_name: string;
  is_active: boolean;
  target_fte_percent?: number;
  constraints?: any;
}

interface BulkAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: StaffMember[];
  blockedDates: { user_id: string; date: string }[];
  initialDate?: string;
  initialType?: ShiftType;
}

export function BulkAssignDialog({ open, onOpenChange, staff, blockedDates, initialDate, initialType }: BulkAssignDialogProps) {
  const queryClient = useQueryClient();
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [date, setDate] = useState(initialDate || "");
  const [type, setType] = useState<ShiftType>(initialType || "morning");
  const [startTime, setStartTime] = useState(shiftTimes[initialType || "morning"].start);
  const [endTime, setEndTime] = useState(shiftTimes[initialType || "morning"].end);
  const [isDraft, setIsDraft] = useState(true);
  const [overtimeConfirmOpen, setOvertimeConfirmOpen] = useState(false);
  const [overtimeStaff, setOvertimeStaff] = useState<{ name: string; current: number; max: number }[]>([]);

  useEffect(() => {
    if (open) {
      if (initialDate) setDate(initialDate);
      if (initialType) {
        setType(initialType);
        setStartTime(shiftTimes[initialType].start);
        setEndTime(shiftTimes[initialType].end);
      }
      setSelectedStaff([]);
    }
  }, [open, initialDate, initialType]);

  // Unified staff pool: profiles + unclaimed staff_directory ("pending") entries.
  const { data: staffPool = [] } = useStaffPool();
  const staffProfiles = staffPool.filter((p) => p.is_active || p.kind === "pending");

  // Fetch existing shifts for the month to calculate hours
  const monthKey = date ? format(startOfMonth(parseISO(date)), "yyyy-MM") : "";
  const { data: monthShifts = [] } = useQuery({
    queryKey: ["month-shifts-hours", monthKey],
    queryFn: async () => {
      if (!date) return [];
      const d = parseISO(date);
      const { data, error } = await supabase
        .from("shifts")
        .select("assigned_user_id, date")
        .gte("date", format(startOfMonth(d), "yyyy-MM-dd"))
        .lte("date", format(endOfMonth(d), "yyyy-MM-dd"))
        .not("assigned_user_id", "is", null);
      if (error) throw error;
      return data;
    },
    enabled: !!date,
  });

  // Build a map of user_id → shift count this month
  const shiftCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of monthShifts) {
      if (s.assigned_user_id) {
        map[s.assigned_user_id] = (map[s.assigned_user_id] || 0) + 1;
      }
    }
    return map;
  }, [monthShifts]);

  const getConstraintReason = (userId: string): string | null => {
    const profile = staffProfiles.find((p) => p.id === userId);
    if (!profile) return null;
    const c = typeof profile.constraints === "object" && profile.constraints !== null ? profile.constraints : {};

    // New exclusion model
    const excludedShifts: string[] = (c as any).excluded_shifts || [];
    const excludedDays: number[] = (c as any).excluded_days || [];

    if (excludedShifts.includes(type)) {
      return `${type.charAt(0).toUpperCase() + type.slice(1)} excluded`;
    }

    if (date) {
      try {
        const d = parseISO(date);
        const dayOfWeek = getDay(d);
        if (excludedDays.includes(dayOfWeek)) {
          const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
          return `${dayNames[dayOfWeek]} excluded`;
        }
      } catch {}
    }

    // Legacy support
    if (type === "night" && (c as any).no_nights && !excludedShifts.includes("night")) {
      return "No night shifts";
    }
    if (date) {
      try {
        const d = parseISO(date);
        if (getDay(d) === 6 && (c as any).no_weekends && !excludedDays.includes(6)) {
          return "No weekend shifts";
        }
      } catch {}
    }
    return null;
  };

  const isBlocked = (userId: string) =>
    blockedDates.some((b) => b.user_id === userId && b.date === date);

  const isConstrained = (userId: string) => !!getConstraintReason(userId);

  const toggleStaff = (id: string) => {
    if (isConstrained(id)) return; // Can't select constrained staff
    setSelectedStaff((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleTypeChange = (t: ShiftType) => {
    setType(t);
    setStartTime(shiftTimes[t].start);
    setEndTime(shiftTimes[t].end);
    // Deselect any staff that are now constrained
    // Deselect any staff that are now constrained by new type
    setSelectedStaff((prev) => prev.filter((id) => !getConstraintReason(id)));
  };

  const checkOvertimeAndAssign = () => {
    const exceeding: { name: string; current: number; max: number }[] = [];
    for (const userId of selectedStaff) {
      const profile = staffProfiles.find((p) => p.id === userId);
      if (!profile) continue;
      const fte = profile.target_fte_percent ?? 1;
      const maxHours = MONTHLY_HOURS_100_FTE * fte;
      const currentShifts = shiftCountMap[userId] || 0;
      const newHours = (currentShifts + 1) * HOURS_PER_SHIFT;
      if (newHours > maxHours) {
        exceeding.push({
          name: profile.full_name,
          current: currentShifts * HOURS_PER_SHIFT,
          max: maxHours,
        });
      }
    }
    if (exceeding.length > 0) {
      setOvertimeStaff(exceeding);
      setOvertimeConfirmOpen(true);
    } else {
      bulkAssign.mutate();
    }
  };

  const bulkAssign = useMutation({
    mutationFn: async () => {
      if (!date || selectedStaff.length === 0) throw new Error("Select a date and at least one staff member");
      const inserts = selectedStaff.map((userId) => ({
        date,
        type,
        start_time: startTime,
        end_time: endTime,
        assigned_user_id: userId,
        is_draft: isDraft,
        is_responsible_on_shift: false,
      }));
      const { error } = await supabase.from("shifts").insert(inserts);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster-shifts"] });
      queryClient.invalidateQueries({ queryKey: ["mgmt-calendar-shifts"] });
      queryClient.invalidateQueries({ queryKey: ["month-shifts-hours"] });
      toast.success(`${selectedStaff.length} shifts created`);
      setSelectedStaff([]);
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Merge staff prop with profile data
  const displayStaff = staff.map((s) => {
    const profile = staffProfiles.find((p) => p.id === s.id);
    return { ...s, ...profile };
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Bulk Assign Shift
            </DialogTitle>
            <DialogDescription>Select staff members to assign to a shift.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => handleTypeChange(v as ShiftType)}>
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
                <Label>Start</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>End</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>Draft</Label>
              <Switch checked={isDraft} onCheckedChange={setIsDraft} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Select Staff</Label>
                {selectedStaff.length > 0 && (
                  <Badge variant="secondary">{selectedStaff.length} selected</Badge>
                )}
              </div>
              <ScrollArea className="h-48 rounded-md border p-2">
                {displayStaff.map((s) => {
                  const blocked = date ? isBlocked(s.id) : false;
                  const constraintReason = date ? getConstraintReason(s.id) : null;
                  const disabled = blocked || !!constraintReason;
                  const fte = (s as any).target_fte_percent ?? 1;
                  const maxHours = MONTHLY_HOURS_100_FTE * fte;
                  const currentHours = (shiftCountMap[s.id] || 0) * HOURS_PER_SHIFT;
                  const nearLimit = currentHours >= maxHours * 0.8;

                  return (
                    <label
                      key={s.id}
                      className={`flex items-center gap-2 rounded px-2 py-1.5 ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-accent/30 cursor-pointer"}`}
                    >
                      <Checkbox
                        checked={selectedStaff.includes(s.id)}
                        onCheckedChange={() => toggleStaff(s.id)}
                        disabled={disabled}
                      />
                      <span className="text-sm flex-1">{s.full_name}</span>
                      {constraintReason && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 text-destructive border-destructive/30">
                          <Ban className="h-2.5 w-2.5 mr-0.5" />
                          {constraintReason}
                        </Badge>
                      )}
                      {blocked && <Badge variant="destructive" className="text-[10px] px-1 py-0">Blocked</Badge>}
                      {!disabled && nearLimit && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 text-yellow-600 border-yellow-300">
                          <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                          {currentHours}h/{maxHours}h
                        </Badge>
                      )}
                    </label>
                  );
                })}
              </ScrollArea>
            </div>

            <Button
              className="w-full"
              onClick={checkOvertimeAndAssign}
              disabled={bulkAssign.isPending || selectedStaff.length === 0 || !date}
            >
              Assign {selectedStaff.length} Staff
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={overtimeConfirmOpen} onOpenChange={setOvertimeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Monthly Hours Exceeded
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-2">The following staff will exceed their monthly hour allowance:</p>
                <ul className="space-y-1">
                  {overtimeStaff.map((s) => (
                    <li key={s.name} className="text-sm">
                      <span className="font-medium">{s.name}</span>: currently {s.current}h, max {s.max}h — adding {HOURS_PER_SHIFT}h more
                    </li>
                  ))}
                </ul>
                <p className="mt-3">Do you want to proceed anyway?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setOvertimeConfirmOpen(false); bulkAssign.mutate(); }}>
              Assign Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
