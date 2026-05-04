import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import {
  shiftPaidHours,
  shiftDurationHours,
  type PayrollShift,
  type StaffPayrollTotals,
} from "./payroll";

const SHIFT_LABEL_HE: Record<string, string> = { morning: "בוקר", evening: "ערב", night: "לילה" };
const LEAVE_LABEL_HE: Record<string, string> = {
  sick_leave: "מחלה",
  maternity_leave: "חופשת לידה",
  yearly_leave: "חופשה שנתית",
  study: "ימי לימודים",
  vacation: "חופשה",
  block: "חסום",
  leave: "חופשה",
};

function fmtHours(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2);
}

// Build rows for one staff: each worked shift + each leave day-range
interface RowEntry {
  date: string;
  type: string; // 'shift' | leave type
  shiftType?: string;
  scheduled?: string;
  actual?: string;
  hours: number;
  status: string;
  note?: string;
}

function buildStaffRows(staff: StaffPayrollTotals): RowEntry[] {
  const rows: RowEntry[] = [];
  for (const s of staff.shifts) {
    rows.push({
      date: s.date,
      type: "shift",
      shiftType: s.type,
      scheduled: `${s.start_time?.slice(0, 5)}–${s.end_time?.slice(0, 5)}`,
      actual: s.actual_start_time && s.actual_end_time ? `${s.actual_start_time}–${s.actual_end_time}` : "—",
      hours: shiftPaidHours(s),
      status: s.is_verified ? "מאומת" : (s.is_standby ? "כוננות" : "לא מאומת"),
      note: s.is_responsible_on_shift ? "אחראית" : undefined,
    });
  }
  for (const l of staff.leave) {
    rows.push({
      date: l.end_date && l.end_date !== l.date ? `${l.date} → ${l.end_date}` : l.date,
      type: l.type,
      hours: 0,
      status: LEAVE_LABEL_HE[l.type] || l.type,
      note: l.reason || undefined,
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

// ─────────────────────────────────────────────────────────────────────
// EXCEL
// ─────────────────────────────────────────────────────────────────────

export function exportWardPayrollExcel(staffList: StaffPayrollTotals[], monthLabel: string) {
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summary = [
    ["דו״ח שכר מחלקה", monthLabel],
    [],
    ["שם", "שעות רגילות", "שעות כוננות", "סה״כ שעות", "משמרות אחראית", "ימי חופשה/מחלה"],
    ...staffList.map((s) => [
      s.full_name,
      Number(fmtHours(s.regularHours)),
      Number(fmtHours(s.onCallHours)),
      Number(fmtHours(s.regularHours + s.onCallHours)),
      s.responsibleShifts,
      s.leave.length,
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(summary);
  ws["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws, "סיכום");

  // Per-staff sheet
  for (const s of staffList) {
    const rows = buildStaffRows(s);
    const sheetData = [
      [s.full_name, monthLabel],
      [],
      ["תאריך", "סוג", "מתוכנן", "בפועל", "שעות", "סטטוס", "הערה"],
      ...rows.map((r) => [
        r.date,
        r.type === "shift" ? SHIFT_LABEL_HE[r.shiftType || ""] || r.shiftType : LEAVE_LABEL_HE[r.type] || r.type,
        r.scheduled || "—",
        r.actual || "—",
        Number(fmtHours(r.hours)),
        r.status,
        r.note || "",
      ]),
      [],
      ["סה״כ רגילות", fmtHours(s.regularHours)],
      ["סה״כ כוננות", fmtHours(s.onCallHours)],
      ["משמרות אחראית", s.responsibleShifts],
    ];
    const sws = XLSX.utils.aoa_to_sheet(sheetData);
    sws["!cols"] = [{ wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 24 }];
    const safeName = s.full_name.replace(/[\\/?*[\]:]/g, "").slice(0, 28) || "Staff";
    XLSX.utils.book_append_sheet(wb, sws, safeName);
  }

  XLSX.writeFile(wb, `Ward-Payroll-${monthLabel.replace(/\s+/g, "-")}.xlsx`);
}

export function exportIndividualExcel(staff: StaffPayrollTotals, monthLabel: string) {
  const wb = XLSX.utils.book_new();
  const rows = buildStaffRows(staff);
  const data = [
    ["שם", staff.full_name],
    ["חודש", monthLabel],
    [],
    ["תאריך", "סוג", "מתוכנן", "בפועל", "שעות", "סטטוס", "הערה"],
    ...rows.map((r) => [
      r.date,
      r.type === "shift" ? SHIFT_LABEL_HE[r.shiftType || ""] || r.shiftType : LEAVE_LABEL_HE[r.type] || r.type,
      r.scheduled || "—",
      r.actual || "—",
      Number(fmtHours(r.hours)),
      r.status,
      r.note || "",
    ]),
    [],
    ["סה״כ שעות רגילות", fmtHours(staff.regularHours)],
    ["סה״כ שעות כוננות", fmtHours(staff.onCallHours)],
    ["סה״כ משמרות אחראית", staff.responsibleShifts],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, ws, "Payroll");
  const safe = staff.full_name.replace(/[\\/?*[\]:]/g, "").slice(0, 40) || "staff";
  XLSX.writeFile(wb, `Payroll-${safe}-${monthLabel.replace(/\s+/g, "-")}.xlsx`);
}

// ─────────────────────────────────────────────────────────────────────
// PDF — Staff self-service "My Attendance"
// ─────────────────────────────────────────────────────────────────────

export function exportMyAttendancePDF(opts: {
  fullName: string;
  monthLabel: string;
  shifts: PayrollShift[];
  leave: Array<{ type: string; date: string; end_date: string | null; reason: string | null }>;
}) {
  const { fullName, monthLabel, shifts, leave } = opts;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  // Brand header bar
  doc.setFillColor(52, 90, 199); // primary #345AC7
  doc.rect(0, 0, W, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text("WardWise — Attendance Report", 40, 40);
  doc.setFontSize(11);
  doc.text(`${fullName}  •  ${monthLabel}`, 40, 58);

  // Summary cards
  const totals = shifts.reduce(
    (acc, s) => {
      const h = shiftPaidHours(s);
      if (s.is_standby) acc.onCall += h;
      else acc.regular += h;
      if (s.is_verified) acc.verified += 1;
      if (s.is_responsible_on_shift) acc.responsible += 1;
      return acc;
    },
    { regular: 0, onCall: 0, verified: 0, responsible: 0 },
  );

  doc.setTextColor(20, 20, 20);
  const cardY = 95;
  const cards = [
    { label: "Regular Hours", value: fmtHours(totals.regular) },
    { label: "On-Call Hours", value: fmtHours(totals.onCall) },
    { label: "Verified Shifts", value: String(totals.verified) },
    { label: "Responsible", value: String(totals.responsible) },
  ];
  const cardW = (W - 80 - 30) / 4;
  cards.forEach((c, i) => {
    const x = 40 + i * (cardW + 10);
    doc.setDrawColor(220, 220, 230);
    doc.setFillColor(247, 248, 252);
    doc.roundedRect(x, cardY, cardW, 60, 6, 6, "FD");
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 120);
    doc.text(c.label, x + 12, cardY + 22);
    doc.setFontSize(18);
    doc.setTextColor(20, 20, 20);
    doc.text(c.value, x + 12, cardY + 46);
  });

  // Build merged rows: shifts + leave
  type Row = [string, string, string, string, string, string];
  const rows: Row[] = [];

  for (const s of shifts) {
    rows.push([
      s.date,
      SHIFT_LABEL_HE[s.type] || s.type,
      `${s.start_time?.slice(0, 5)}–${s.end_time?.slice(0, 5)}`,
      s.actual_start_time && s.actual_end_time ? `${s.actual_start_time}–${s.actual_end_time}` : "—",
      fmtHours(shiftPaidHours(s)),
      s.is_verified ? "Verified ✓" : s.is_standby ? "On-Call" : "Pending",
    ]);
  }
  for (const l of leave) {
    const range = l.end_date && l.end_date !== l.date ? `${l.date} → ${l.end_date}` : l.date;
    rows.push([range, LEAVE_LABEL_HE[l.type] || l.type, "—", "—", "0", l.reason || (LEAVE_LABEL_HE[l.type] || "")]);
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]));

  autoTable(doc, {
    startY: cardY + 80,
    head: [["Date", "Type", "Scheduled", "Actual", "Hours", "Status"]],
    body: rows.length ? rows : [["—", "—", "—", "—", "0", "No records"]],
    headStyles: { fillColor: [52, 90, 199], textColor: 255, fontStyle: "bold" },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 249, 253] },
    margin: { left: 40, right: 40 },
  });

  // Footer
  const ph = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(`Generated ${format(new Date(), "yyyy-MM-dd HH:mm", { locale: he })}`, 40, ph - 20);

  doc.save(`Attendance-${fullName.replace(/\s+/g, "-")}-${monthLabel.replace(/\s+/g, "-")}.pdf`);
}
