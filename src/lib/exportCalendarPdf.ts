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

  // Capture in the same aspect ratio as the landscape PDF page. This keeps the
  // calendar from becoming an ultra-wide strip with large empty margins above
  // and below, while still giving each day column enough width for names.
  const CAPTURE_WIDTH = 1600;
  const CAPTURE_HEIGHT = 1080;
  const prevWidth = element.style.width;
  const prevHeight = element.style.height;
  const prevMaxWidth = element.style.maxWidth;
  const prevMinWidth = element.style.minWidth;
  const prevMaxHeight = element.style.maxHeight;
  const prevMinHeight = element.style.minHeight;
  const prevDatasetValue = element.getAttribute("data-pdf-export");
  const style = document.createElement("style");
  style.id = "calendar-pdf-export-styles";
  style.textContent = `
    [data-pdf-export="true"] { direction: inherit; }
    [data-pdf-export="true"] { height: ${CAPTURE_HEIGHT}px !important; min-height: ${CAPTURE_HEIGHT}px !important; }
    [data-pdf-export="true"] .overflow-hidden { overflow: hidden !important; }
    [data-pdf-export="true"] table { height: 100% !important; min-height: 100% !important; }
    [data-pdf-export="true"] tbody { height: 100% !important; }
    [data-pdf-export="true"] tr { height: auto !important; }
    [data-pdf-export="true"] td { overflow: hidden !important; }
    [data-pdf-export="true"] .calendar-shift-box { overflow: hidden !important; padding: 4px 5px !important; }
    [data-pdf-export="true"] .calendar-staff-list { gap: 4px !important; min-width: 0 !important; }
    [data-pdf-export="true"] .calendar-staff-badge {
      display: flex !important;
      align-items: center !important;
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      height: 18px !important;
      min-height: 18px !important;
      max-height: 18px !important;
      padding: 1px 5px !important;
      overflow: hidden !important;
      white-space: nowrap !important;
      line-height: 16px !important;
      font-size: 10px !important;
      border-radius: 4px !important;
    }
    [data-pdf-export="true"] .calendar-staff-name {
      min-width: 0 !important;
      flex: 1 1 auto !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      line-height: 16px !important;
    }
    [data-pdf-export="true"] .calendar-staff-badge svg {
      width: 10px !important;
      height: 10px !important;
      flex: 0 0 auto !important;
    }
  `;

  document.head.appendChild(style);
  element.setAttribute("data-pdf-export", "true");
  element.style.width = `${CAPTURE_WIDTH}px`;
  element.style.height = `${CAPTURE_HEIGHT}px`;
  element.style.maxWidth = `${CAPTURE_WIDTH}px`;
  element.style.minWidth = `${CAPTURE_WIDTH}px`;
  element.style.maxHeight = `${CAPTURE_HEIGHT}px`;
  element.style.minHeight = `${CAPTURE_HEIGHT}px`;

  // Allow layout to settle
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: bgColor,
      width: CAPTURE_WIDTH,
      height: CAPTURE_HEIGHT,
      windowWidth: CAPTURE_WIDTH,
      windowHeight: CAPTURE_HEIGHT,
      logging: false,
    });
  } finally {
    element.style.width = prevWidth;
    element.style.height = prevHeight;
    element.style.maxWidth = prevMaxWidth;
    element.style.minWidth = prevMinWidth;
    element.style.maxHeight = prevMaxHeight;
    element.style.minHeight = prevMinHeight;
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
