import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  startOfMonth,
  endOfMonth,
  format,
  addMonths,
  subMonths,
} from "date-fns";
import { he, enUS } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileDown,
  Baby,
  Thermometer,
  Palmtree,
} from "lucide-react";
import { useTranslation } from "@/i18n/useTranslation";
import { aggregateStaffTotals, type PayrollShift, type StaffPayrollTotals } from "@/lib/payroll";
import { exportWardPayrollExcel, exportIndividualExcel } from "@/lib/payrollExport";
import { isLeaveType } from "@/lib/availabilityTypes";

const LEAVE_ICON: Record<string, any> = {
  sick_leave: Thermometer,
  maternity_leave: Baby,
  yearly_leave: Palmtree,
  vacation: Palmtree,
};

export default function PayrollDashboard() {
  const { t, locale } = useTranslation();
  const dateLocale = locale === "he" ? he : enUS;
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const startStr = format(start, "yyyy-MM-dd");
  const endStr = format(end, "yyyy-MM-dd");
  const monthLabel = format(month, "MMMM yyyy", { locale: dateLocale });

  // 1. All staff (active + pending activation)
  const { data: staff = [] } = useQuery({
    queryKey: ["payroll-staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, is_active")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  // 2. Shifts in month
  const { data: shifts = [] } = useQuery({
    queryKey: ["payroll-shifts", startStr, endStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("id, date, type, start_time, end_time, actual_start_time, actual_end_time, is_verified, is_standby, is_responsible_on_shift, assigned_user_id, comments")
        .eq("is_draft", false)
        .not("assigned_user_id", "is", null)
        .gte("date", startStr)
        .lte("date", endStr);
      if (error) throw error;
      return (data || []) as Array<PayrollShift & { assigned_user_id: string }>;
    },
  });

  // 3. Approved leave/blocks overlapping month
  const { data: leaves = [] } = useQuery({
    queryKey: ["payroll-leaves", startStr, endStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_requests")
        .select("user_id, request_type, date, end_date, reason, status")
        .eq("status", "approved")
        .lte("date", endStr)
        .or(`end_date.gte.${startStr},and(end_date.is.null,date.gte.${startStr})`);
      if (error) throw error;
      return data || [];
    },
  });

  // 4. Build per-staff totals
  const staffTotals = useMemo<StaffPayrollTotals[]>(() => {
    return staff.map((s: any) => {
      const userShifts = shifts.filter((sh) => sh.assigned_user_id === s.id);
      const userLeave = leaves
        .filter((l: any) => l.user_id === s.id)
        .map((l: any) => ({
          type: l.request_type,
          date: l.date,
          end_date: l.end_date,
          reason: l.reason,
        }));
      const totals = aggregateStaffTotals(userShifts);
      return {
        user_id: s.id,
        full_name: s.full_name,
        is_active: s.is_active,
        regularHours: totals.regularHours,
        onCallHours: totals.onCallHours,
        responsibleShifts: totals.responsibleShifts,
        shifts: userShifts,
        leave: userLeave,
      } as StaffPayrollTotals & { is_active: boolean };
    });
  }, [staff, shifts, leaves]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">{t("payroll.title")}</h1>
        <Button onClick={() => exportWardPayrollExcel(staffTotals, monthLabel)} className="gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          {t("payroll.exportWard")}
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <Button variant="ghost" size="icon" onClick={() => setMonth(subMonths(month, 1))}>
            <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
          </Button>
          <CardTitle className="text-2xl">{monthLabel}</CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight className="h-5 w-5 rtl:rotate-180" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("payroll.staffName")}</TableHead>
                  <TableHead className="text-end">{t("payroll.regularHours")}</TableHead>
                  <TableHead className="text-end">{t("payroll.onCallHours")}</TableHead>
                  <TableHead className="text-end">{t("payroll.responsibleShifts")}</TableHead>
                  <TableHead>{t("payroll.leave")}</TableHead>
                  <TableHead className="text-end w-20"> </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffTotals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      {t("payroll.noStaff")}
                    </TableCell>
                  </TableRow>
                ) : (
                  staffTotals.map((s) => (
                    <TableRow key={s.user_id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{s.full_name}</span>
                          {!(s as any).is_active && (
                            <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[10px] px-1.5 py-0.5 uppercase tracking-wide">
                              Pending
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-end tabular-nums">{s.regularHours.toFixed(2)}</TableCell>
                      <TableCell className="text-end tabular-nums">{s.onCallHours.toFixed(2)}</TableCell>
                      <TableCell className="text-end tabular-nums">{s.responsibleShifts}</TableCell>
                      <TableCell>
                        {s.leave.length === 0 ? (
                          <span className="text-muted-foreground text-xs">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {s.leave.map((l, i) => {
                              const Icon = LEAVE_ICON[l.type];
                              return (
                                <span
                                  key={i}
                                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                                  title={l.reason || ""}
                                >
                                  {Icon && <Icon className="h-3 w-3" />}
                                  <span>{t(`common.${l.type === "sick_leave" ? "sickLeave" : l.type === "maternity_leave" ? "maternityLeave" : l.type === "yearly_leave" ? "yearlyLeave" : l.type}`)}</span>
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t("payroll.exportIndividual")}
                          onClick={() => exportIndividualExcel(s, monthLabel)}
                        >
                          <FileSpreadsheet className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <FileDown className="h-3 w-3" />
        {t("payroll.hint")}
      </p>
    </div>
  );
}
