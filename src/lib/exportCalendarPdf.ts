import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface ExportOptions {
  /** The DOM element to capture (the calendar container). */
  element: HTMLElement;
  /** Filename WITHOUT extension. */
  fileName: string;
  /** Optional title — currently ignored to avoid font/encoding issues with non-Latin scripts. */
  title?: string;
}

/**
 * Capture a calendar DOM node and save it as a single-page landscape A4 PDF
 * that fits the entire view.
 *
 * To prevent staff badges from overlapping or being clipped inside narrow
 * cells, we temporarily widen the element to a desktop-class width before
 * capturing, then restore the original styles.
 */
export async function exportCalendarToPdf({ element, fileName }: ExportOptions) {
  const bgColor =
    getComputedStyle(document.body).backgroundColor || "#ffffff";

  // Force a wide layout for the capture so flex/grid cells get enough room
  // and badges don't overlap. The PDF stylesheet below makes the view compact
  // enough to fit while preserving one staff row per line.
  const CAPTURE_WIDTH = 2200;
  const prevWidth = element.style.width;
  const prevMaxWidth = element.style.maxWidth;
  const prevMinWidth = element.style.minWidth;
  const prevDatasetValue = element.getAttribute("data-pdf-export");
  const style = document.createElement("style");
  style.id = "calendar-pdf-export-styles";
  style.textContent = `
    [data-pdf-export="true"] { direction: inherit; }
    [data-pdf-export="true"] .overflow-hidden { overflow: visible !important; }
    [data-pdf-export="true"] .flex-1 { flex: none !important; }
    [data-pdf-export="true"] .h-full { height: auto !important; }
    [data-pdf-export="true"] table { height: auto !important; min-height: 0 !important; }
    [data-pdf-export="true"] tr { height: auto !important; }
    [data-pdf-export="true"] td { height: auto !important; min-height: 0 !important; overflow: hidden !important; }
    [data-pdf-export="true"] .calendar-shift-box { overflow: hidden !important; padding: 2px 4px !important; }
    [data-pdf-export="true"] .calendar-staff-list { gap: 2px !important; min-width: 0 !important; }
    [data-pdf-export="true"] .calendar-staff-badge {
      display: flex !important;
      align-items: center !important;
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      height: 13px !important;
      min-height: 13px !important;
      max-height: 13px !important;
      padding: 0 3px !important;
      overflow: hidden !important;
      white-space: nowrap !important;
      line-height: 12px !important;
      font-size: 8px !important;
      border-radius: 2px !important;
    }
    [data-pdf-export="true"] .calendar-staff-name {
      min-width: 0 !important;
      flex: 1 1 auto !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      line-height: 12px !important;
    }
    [data-pdf-export="true"] .calendar-staff-badge svg {
      width: 8px !important;
      height: 8px !important;
      flex: 0 0 auto !important;
    }
  `;

  document.head.appendChild(style);
  element.setAttribute("data-pdf-export", "true");
  element.style.width = `${CAPTURE_WIDTH}px`;
  element.style.maxWidth = `${CAPTURE_WIDTH}px`;
  element.style.minWidth = `${CAPTURE_WIDTH}px`;

  // Allow layout to settle
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: bgColor,
      width: CAPTURE_WIDTH,
      windowWidth: CAPTURE_WIDTH,
      windowHeight: element.scrollHeight,
      logging: false,
    });
  } finally {
    element.style.width = prevWidth;
    element.style.maxWidth = prevMaxWidth;
    element.style.minWidth = prevMinWidth;
    if (prevDatasetValue === null) {
      element.removeAttribute("data-pdf-export");
    } else {
      element.setAttribute("data-pdf-export", prevDatasetValue);
    }
    style.remove();
  }

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageW = pdf.internal.pageSize.getWidth();   // 297mm
  const pageH = pdf.internal.pageSize.getHeight();  // 210mm
  const margin = 6;

  const availableW = pageW - margin * 2;
  const availableH = pageH - margin * 2;

  const imgRatio = canvas.width / canvas.height;
  const boxRatio = availableW / availableH;

  let drawW: number;
  let drawH: number;
  if (imgRatio > boxRatio) {
    drawW = availableW;
    drawH = availableW / imgRatio;
  } else {
    drawH = availableH;
    drawW = availableH * imgRatio;
  }

  const x = (pageW - drawW) / 2;
  const y = (pageH - drawH) / 2;

  const imgData = canvas.toDataURL("image/png");
  pdf.addImage(imgData, "PNG", x, y, drawW, drawH, undefined, "FAST");

  pdf.save(`${fileName}.pdf`);
}
