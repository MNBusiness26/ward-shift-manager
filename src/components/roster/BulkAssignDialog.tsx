import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type ShiftType = Database["public"]["Enums"]["shift_type"];

const shiftTimes: Record<ShiftType, { start: string; end: string }> = {
  morning: { start: "07:00", end: "15:00" },
  evening: { start: "15:00", end: "23:00" },
  night: { start: "23:00", end: "07:00" },
};

interface StaffMember {
  id: string;
  full_name: string;
  is_active: boolean;
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

  const isBlocked = (userId: string) =>
    blockedDates.some((b) => b.user_id === userId && b.date === date);

  const toggleStaff = (id: string) => {
    setSelectedStaff((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleTypeChange = (t: ShiftType) => {
    setType(t);
    setStartTime(shiftTimes[t].start);
    setEndTime(shiftTimes[t].end);
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
      toast.success(`${selectedStaff.length} shifts created`);
      setSelectedStaff([]);
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Bulk Assign Shift
          </DialogTitle>
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
              {staff.map((s) => {
                const blocked = date ? isBlocked(s.id) : false;
                return (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent/30 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedStaff.includes(s.id)}
                      onCheckedChange={() => toggleStaff(s.id)}
                    />
                    <span className="text-sm">{s.full_name}</span>
                    {blocked && <Badge variant="destructive" className="text-[10px] px-1 py-0">Blocked</Badge>}
                  </label>
                );
              })}
            </ScrollArea>
          </div>

          <Button
            className="w-full"
            onClick={() => bulkAssign.mutate()}
            disabled={bulkAssign.isPending || selectedStaff.length === 0 || !date}
          >
            Assign {selectedStaff.length} Staff
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
