import ExcelJS from "exceljs";
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

// Brand palette
const NAVY = "FF0F172A";
const WHITE = "FFFFFFFF";
const SLATE = "FF94A3B8";
const COLOR_MORNING = "FFEBB00D";
const COLOR_EVENING = "FFEE6F4F";
const COLOR_NIGHT = "FF4051B5";
const FONT_NAME = "Heebo";

function fmtHours(n: number) {
  return Math.round(n * 100) / 100;
}

interface ShiftHourBuckets {
  morning: number;
  evening: number;
  night: number;
  onCall: number;
  regular: number; // morning+evening+night (non-standby)
}

function bucketHours(shifts: PayrollShift[]): ShiftHourBuckets {
  const b: ShiftHourBuckets = { morning: 0, evening: 0, night: 0, onCall: 0, regular: 0 };
  for (const s of shifts) {
    const h = shiftPaidHours(s);
    if (s.is_standby) {
      b.onCall += h;
      continue;
    }
    if (s.type === "morning") b.morning += h;
    else if (s.type === "evening") b.evening += h;
    else if (s.type === "night") b.night += h;
    b.regular += h;
  }
  return b;
}

const THIN_SLATE: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: SLATE } },
  left: { style: "thin", color: { argb: SLATE } },
  bottom: { style: "thin", color: { argb: SLATE } },
  right: { style: "thin", color: { argb: SLATE } },
};

const MEDIUM_TOP: Partial<ExcelJS.Borders> = {
  top: { style: "medium", color: { argb: NAVY } },
  left: { style: "thin", color: { argb: SLATE } },
  bottom: { style: "thin", color: { argb: SLATE } },
  right: { style: "thin", color: { argb: SLATE } },
};

function applyHeaderStyle(ws: ExcelJS.Worksheet, rowNum: number, colCount: number) {
  const row = ws.getRow(rowNum);
  row.height = 28;
  for (let c = 1; c <= colCount; c++) {
    const cell = ws.getCell(rowNum, c);
    cell.font = { name: FONT_NAME, size: 14, bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { vertical: "middle", horizontal: "right", wrapText: true };
    cell.border = THIN_SLATE;
  }
}

function styleDataCells(
  ws: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  colCount: number,
) {
  for (let r = startRow; r <= endRow; r++) {
    const row = ws.getRow(r);
    row.height = 25;
    for (let c = 1; c <= colCount; c++) {
      const cell = ws.getCell(r, c);
      cell.font = { name: FONT_NAME, size: 11, ...(cell.font || {}) };
      cell.alignment = { vertical: "middle", horizontal: "right", ...(cell.alignment || {}) };
      // Only border cells that actually have content
      const v = cell.value;
      const hasContent = v !== null && v !== undefined && v !== "";
      if (hasContent) cell.border = THIN_SLATE;
    }
  }
}

function autoFitColumns(ws: ExcelJS.Worksheet, minWidth = 10, maxWidth = 40) {
  ws.columns.forEach((col) => {
    let max = minWidth;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      const s = v == null ? "" : String(v);
      // Hebrew chars are wider; bias the calc slightly
      const len = Array.from(s).reduce((acc, ch) => acc + (ch.charCodeAt(0) > 127 ? 1.6 : 1), 0);
      if (len > max) max = len;
    });
    col.width = Math.min(maxWidth, Math.max(minWidth, max + 2));
  });
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
// Ward Payroll — single "סיכום" sheet
// ─────────────────────────────────────────────────────────────────────

export async function exportWardPayrollExcel(staffList: StaffPayrollTotals[], monthLabel: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("סיכום", { views: [{ rightToLeft: true }] });

  // Title row (row 1) — keep navy header style for the first columns
  ws.addRow([`דו״ח שכר מחלקה — ${monthLabel}`]);
  ws.mergeCells(1, 1, 1, 9);
  const title = ws.getCell(1, 1);
  title.font = { name: FONT_NAME, size: 16, bold: true, color: { argb: WHITE } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  title.alignment = { vertical: "middle", horizontal: "right" };
  ws.getRow(1).height = 32;

  // Spacer
  ws.addRow([]);

  // Column headers (row 3)
  const headers = [
    "שם",
    "שעות רגילות",
    "שעות בוקר",
    "שעות ערב",
    "שעות לילה",
    "שעות כוננות",
    "סה״כ שעות",
    "משמרות אחראית",
    "ימי חופשה/מחלה",
  ];
  ws.addRow(headers);
  applyHeaderStyle(ws, 3, headers.length);

  // Data rows
  let totalRegular = 0, totalMorning = 0, totalEvening = 0, totalNight = 0, totalOnCall = 0, totalAll = 0, totalResp = 0, totalLeave = 0;

  for (const s of staffList) {
    const b = bucketHours(s.shifts);
    const total = b.regular + b.onCall;
    totalRegular += b.regular; totalMorning += b.morning; totalEvening += b.evening;
    totalNight += b.night; totalOnCall += b.onCall; totalAll += total;
    totalResp += s.responsibleShifts; totalLeave += s.leave.length;

    ws.addRow([
      s.full_name,
      fmtHours(b.regular),
      fmtHours(b.morning),
      fmtHours(b.evening),
      fmtHours(b.night),
      fmtHours(b.onCall),
      fmtHours(total),
      s.responsibleShifts,
      s.leave.length,
    ]);
  }

  const dataStart = 4;
  const dataEnd = 3 + staffList.length;
  styleDataCells(ws, dataStart, dataEnd, headers.length);

  // Spacer (no borders)
  ws.addRow([]);

  // Totals row with medium top border
  const totalRowIdx = dataEnd + 2;
  ws.addRow([
    "סה״כ",
    fmtHours(totalRegular),
    fmtHours(totalMorning),
    fmtHours(totalEvening),
    fmtHours(totalNight),
    fmtHours(totalOnCall),
    fmtHours(totalAll),
    totalResp,
    totalLeave,
  ]);
  const totalRow = ws.getRow(totalRowIdx);
  totalRow.height = 28;
  for (let c = 1; c <= headers.length; c++) {
    const cell = ws.getCell(totalRowIdx, c);
    cell.font = { name: FONT_NAME, size: 12, bold: true };
    cell.alignment = { vertical: "middle", horizontal: "right" };
    cell.border = MEDIUM_TOP;
  }

  autoFitColumns(ws, 12, 32);

  await downloadWorkbook(wb, `Ward-Payroll-${monthLabel.replace(/\s+/g, "-")}.xlsx`);
}

// ─────────────────────────────────────────────────────────────────────
// Individual Payroll
// ─────────────────────────────────────────────────────────────────────

interface IndivRow {
  date: string;
  typeKey: string; // morning/evening/night/leave-key
  typeLabel: string;
  scheduled: string;
  actual: string;
  hours: number;
  status: string;
  note: string;
  isShift: boolean;
}

function buildIndividualRows(staff: StaffPayrollTotals): IndivRow[] {
  const rows: IndivRow[] = [];
  for (const s of staff.shifts) {
    rows.push({
      date: s.date,
      typeKey: s.type,
      typeLabel: SHIFT_LABEL_HE[s.type] || s.type,
      scheduled: `${s.start_time?.slice(0, 5)}–${s.end_time?.slice(0, 5)}`,
      actual: s.actual_start_time && s.actual_end_time ? `${s.actual_start_time}–${s.actual_end_time}` : "—",
      hours: shiftPaidHours(s),
      status: s.is_verified ? "מאומת" : (s.is_standby ? "כוננות" : "לא מאומת"),
      note: s.is_responsible_on_shift ? "אחראית" : "",
      isShift: true,
    });
  }
  for (const l of staff.leave) {
    rows.push({
      date: l.end_date && l.end_date !== l.date ? `${l.date} → ${l.end_date}` : l.date,
      typeKey: l.type,
      typeLabel: LEAVE_LABEL_HE[l.type] || l.type,
      scheduled: "—",
      actual: "—",
      hours: 0,
      status: LEAVE_LABEL_HE[l.type] || l.type,
      note: l.reason || "",
      isShift: false,
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

const TYPE_FILL: Record<string, string> = {
  morning: COLOR_MORNING,
  evening: COLOR_EVENING,
  night: COLOR_NIGHT,
};

export async function exportIndividualExcel(staff: StaffPayrollTotals, monthLabel: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Payroll", { views: [{ rightToLeft: true }] });

  // Title block
  ws.addRow([`${staff.full_name} — ${monthLabel}`]);
  ws.mergeCells(1, 1, 1, 7);
  const title = ws.getCell(1, 1);
  title.font = { name: FONT_NAME, size: 16, bold: true, color: { argb: WHITE } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  title.alignment = { vertical: "middle", horizontal: "right" };
  ws.getRow(1).height = 32;

  ws.addRow([]); // spacer

  // Column headers
  const headers = ["תאריך", "סוג", "מתוכנן", "בפועל", "שעות", "סטטוס", "הערה"];
  ws.addRow(headers);
  applyHeaderStyle(ws, 3, headers.length);

  // Data
  const rows = buildIndividualRows(staff);
  rows.forEach((r) => {
    ws.addRow([
      r.date,
      r.typeLabel,
      r.scheduled,
      r.actual,
      fmtHours(r.hours),
      r.status,
      r.note,
    ]);
  });

  const dataStart = 4;
  const dataEnd = 3 + rows.length;
  styleDataCells(ws, dataStart, dataEnd, headers.length);

  // Color the "סוג" column for shift rows
  rows.forEach((r, i) => {
    const rowIdx = dataStart + i;
    if (!r.isShift) return;
    const fill = TYPE_FILL[r.typeKey];
    if (!fill) return;
    const cell = ws.getCell(rowIdx, 2);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: WHITE } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  // Spacer (no borders)
  ws.addRow([]);

  // Advanced Summary section
  const b = bucketHours(staff.shifts);
  let r = dataEnd + 2;

  // Section header
  ws.getCell(r, 1).value = "סיכום שעות";
  ws.mergeCells(r, 1, r, 7);
  const summaryTitle = ws.getCell(r, 1);
  summaryTitle.font = { name: FONT_NAME, size: 14, bold: true, color: { argb: WHITE } };
  summaryTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  summaryTitle.alignment = { vertical: "middle", horizontal: "right" };
  ws.getRow(r).height = 26;
  r += 1;

  const breakdown: Array<[string, number, string?]> = [
    ["סה״כ שעות בוקר", b.morning, COLOR_MORNING],
    ["סה״כ שעות ערב", b.evening, COLOR_EVENING],
    ["סה״כ שעות לילה", b.night, COLOR_NIGHT],
  ];

  for (const [label, value, color] of breakdown) {
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 2).value = fmtHours(value);
    const labelCell = ws.getCell(r, 1);
    const valueCell = ws.getCell(r, 2);
    labelCell.font = { name: FONT_NAME, size: 12, bold: true };
    labelCell.alignment = { vertical: "middle", horizontal: "right" };
    labelCell.border = THIN_SLATE;
    valueCell.font = { name: FONT_NAME, size: 12, bold: true, color: { argb: WHITE } };
    valueCell.alignment = { vertical: "middle", horizontal: "center" };
    valueCell.border = THIN_SLATE;
    if (color) valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    ws.getRow(r).height = 24;
    r += 1;
  }

  // Totals with medium top border
  const totals: Array<[string, number]> = [
    ["סה״כ שעות רגילות", b.regular],
    ["סה״כ שעות כוננות", b.onCall],
    ["סה״כ משמרות אחראית", staff.responsibleShifts],
  ];
  totals.forEach(([label, value], idx) => {
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 2).value = fmtHours(value);
    const labelCell = ws.getCell(r, 1);
    const valueCell = ws.getCell(r, 2);
    labelCell.font = { name: FONT_NAME, size: 12, bold: true };
    labelCell.alignment = { vertical: "middle", horizontal: "right" };
    valueCell.font = { name: FONT_NAME, size: 12, bold: true };
    valueCell.alignment = { vertical: "middle", horizontal: "right" };
    // Medium top border on the very first totals row to separate from breakdown
    const border = idx === 0 ? MEDIUM_TOP : THIN_SLATE;
    labelCell.border = border;
    valueCell.border = border;
    ws.getRow(r).height = 25;
    r += 1;
  });

  autoFitColumns(ws, 12, 32);

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

  doc.setFillColor(15, 23, 42); // navy
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
    { label: "Regular Hours", value: String(fmtHours(totals.regular)) },
    { label: "On-Call Hours", value: String(fmtHours(totals.onCall)) },
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
      String(fmtHours(shiftPaidHours(s))),
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
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", lineWidth: 1, lineColor: [255, 255, 255] },
    bodyStyles: { fontSize: 9, lineWidth: 0.5, lineColor: [148, 163, 184] },
    alternateRowStyles: { fillColor: [248, 249, 253] },
    margin: { left: 40, right: 40 },
  });

  const ph = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(`Generated ${format(new Date(), "yyyy-MM-dd HH:mm", { locale: he })}`, 40, ph - 20);

  doc.save(`Attendance-${fullName.replace(/\s+/g, "-")}-${monthLabel.replace(/\s+/g, "-")}.pdf`);
}
