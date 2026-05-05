import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import {
  shiftPaidHours,
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

interface RowEntry {
  date: string;
  type: string;
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
// EXCEL helpers
// ─────────────────────────────────────────────────────────────────────

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

function applyTableBorders(
  ws: ExcelJS.Worksheet,
  headerRow: number,
  lastDataRow: number,
  colCount: number,
  totalRows: number[] = [],
) {
  // Header row: thin borders, bold, medium bottom
  for (let c = 1; c <= colCount; c++) {
    const cell = ws.getCell(headerRow, c);
    cell.font = { ...(cell.font || {}), bold: true };
    cell.border = { ...THIN, bottom: { style: "medium" } };
  }
  // Data rows: thin borders
  for (let r = headerRow + 1; r <= lastDataRow; r++) {
    for (let c = 1; c <= colCount; c++) {
      ws.getCell(r, c).border = { ...THIN };
    }
  }
  // Total/summary rows: full thin border + medium top
  for (const tr of totalRows) {
    const row = ws.getRow(tr);
    const used = Math.max(2, row.actualCellCount || 2);
    for (let c = 1; c <= used; c++) {
      ws.getCell(tr, c).border = { ...THIN, top: { style: "medium" } };
      ws.getCell(tr, c).font = { ...(ws.getCell(tr, c).font || {}), bold: c === 1 };
    }
  }
}

async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────
// EXCEL exports
// ─────────────────────────────────────────────────────────────────────

export async function exportWardPayrollExcel(staffList: StaffPayrollTotals[], monthLabel: string) {
  const wb = new ExcelJS.Workbook();

  // Summary sheet
  const ws = wb.addWorksheet("סיכום", { views: [{ rightToLeft: true }] });
  ws.columns = [
    { width: 28 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 16 },
  ];
  ws.addRow(["דו״ח שכר מחלקה", monthLabel]);
  ws.getRow(1).font = { bold: true, size: 14 };
  ws.addRow([]);
  ws.addRow(["שם", "שעות רגילות", "שעות כוננות", "סה״כ שעות", "משמרות אחראית", "ימי חופשה/מחלה"]);
  const summaryHeader = 3;
  for (const s of staffList) {
    ws.addRow([
      s.full_name,
      Number(fmtHours(s.regularHours)),
      Number(fmtHours(s.onCallHours)),
      Number(fmtHours(s.regularHours + s.onCallHours)),
      s.responsibleShifts,
      s.leave.length,
    ]);
  }
  applyTableBorders(ws, summaryHeader, summaryHeader + staffList.length, 6);

  // Per-staff sheets
  for (const s of staffList) {
    const rows = buildStaffRows(s);
    const sws = wb.addWorksheet(
      (s.full_name.replace(/[\\/?*[\]:]/g, "").slice(0, 28) || "Staff"),
      { views: [{ rightToLeft: true }] },
    );
    sws.columns = [
      { width: 22 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 8 }, { width: 12 }, { width: 24 },
    ];
    sws.addRow([s.full_name, monthLabel]);
    sws.getRow(1).font = { bold: true, size: 14 };
    sws.addRow([]);
    sws.addRow(["תאריך", "סוג", "מתוכנן", "בפועל", "שעות", "סטטוס", "הערה"]);
    const headerRow = 3;
    for (const r of rows) {
      sws.addRow([
        r.date,
        r.type === "shift" ? SHIFT_LABEL_HE[r.shiftType || ""] || r.shiftType : LEAVE_LABEL_HE[r.type] || r.type,
        r.scheduled || "—",
        r.actual || "—",
        Number(fmtHours(r.hours)),
        r.status,
        r.note || "",
      ]);
    }
    const lastDataRow = headerRow + rows.length;
    sws.addRow([]); // spacer
    const totalStart = lastDataRow + 2;
    sws.addRow(["סה״כ רגילות", Number(fmtHours(s.regularHours))]);
    sws.addRow(["סה״כ כוננות", Number(fmtHours(s.onCallHours))]);
    sws.addRow(["משמרות אחראית", s.responsibleShifts]);
    applyTableBorders(sws, headerRow, lastDataRow, 7, [totalStart, totalStart + 1, totalStart + 2]);
  }

  await downloadWorkbook(wb, `Ward-Payroll-${monthLabel.replace(/\s+/g, "-")}.xlsx`);
}

export async function exportIndividualExcel(staff: StaffPayrollTotals, monthLabel: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Payroll", { views: [{ rightToLeft: true }] });
  ws.columns = [
    { width: 22 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 8 }, { width: 14 }, { width: 28 },
  ];
  ws.addRow(["שם", staff.full_name]);
  ws.addRow(["חודש", monthLabel]);
  ws.getRow(1).font = { bold: true };
  ws.getRow(2).font = { bold: true };
  ws.addRow([]);
  ws.addRow(["תאריך", "סוג", "מתוכנן", "בפועל", "שעות", "סטטוס", "הערה"]);
  const headerRow = 4;
  const rows = buildStaffRows(staff);
  for (const r of rows) {
    ws.addRow([
      r.date,
      r.type === "shift" ? SHIFT_LABEL_HE[r.shiftType || ""] || r.shiftType : LEAVE_LABEL_HE[r.type] || r.type,
      r.scheduled || "—",
      r.actual || "—",
      Number(fmtHours(r.hours)),
      r.status,
      r.note || "",
    ]);
  }
  const lastDataRow = headerRow + rows.length;
  ws.addRow([]); // spacer
  const totalStart = lastDataRow + 2;
  ws.addRow(["סה״כ שעות רגילות", Number(fmtHours(staff.regularHours))]);
  ws.addRow(["סה״כ שעות כוננות", Number(fmtHours(staff.onCallHours))]);
  ws.addRow(["סה״כ משמרות אחראית", staff.responsibleShifts]);
  applyTableBorders(ws, headerRow, lastDataRow, 7, [totalStart, totalStart + 1, totalStart + 2]);

  const safe = staff.full_name.replace(/[\\/?*[\]:]/g, "").slice(0, 40) || "staff";
  await downloadWorkbook(wb, `Payroll-${safe}-${monthLabel.replace(/\s+/g, "-")}.xlsx`);
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

  doc.setFillColor(52, 90, 199);
  doc.rect(0, 0, W, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text("WardWise — Attendance Report", 40, 40);
  doc.setFontSize(11);
  doc.text(`${fullName}  •  ${monthLabel}`, 40, 58);

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
    theme: "grid",
    head: [["Date", "Type", "Scheduled", "Actual", "Hours", "Status"]],
    body: rows.length ? rows : [["—", "—", "—", "—", "0", "No records"]],
    headStyles: { fillColor: [52, 90, 199], textColor: 255, fontStyle: "bold", lineWidth: 1, lineColor: [255, 255, 255] },
    bodyStyles: { fontSize: 9, lineWidth: 0.5, lineColor: [200, 200, 210] },
    alternateRowStyles: { fillColor: [248, 249, 253] },
    margin: { left: 40, right: 40 },
  });

  const ph = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(`Generated ${format(new Date(), "yyyy-MM-dd HH:mm", { locale: he })}`, 40, ph - 20);

  doc.save(`Attendance-${fullName.replace(/\s+/g, "-")}-${monthLabel.replace(/\s+/g, "-")}.pdf`);
}
