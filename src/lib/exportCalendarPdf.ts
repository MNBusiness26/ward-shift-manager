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
  // and badges don't overlap. 1600px matches a typical desktop calendar view.
  const CAPTURE_WIDTH = 1600;
  const prevWidth = element.style.width;
  const prevMaxWidth = element.style.maxWidth;
  const prevMinWidth = element.style.minWidth;

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
