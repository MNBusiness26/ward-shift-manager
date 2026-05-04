import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface ExportOptions {
  /** The DOM element to capture (the calendar container). */
  element: HTMLElement;
  /** Filename WITHOUT extension. */
  fileName: string;
  /** Optional title rendered above the calendar in the PDF. */
  title?: string;
}

/**
 * Capture a calendar DOM node and save it as a single-page landscape A4 PDF
 * that fits the entire view.
 */
export async function exportCalendarToPdf({ element, fileName, title }: ExportOptions) {
  // Render at 2× for crisp output. Use the page background so the capture
  // matches the on-screen card surface.
  const bgColor =
    getComputedStyle(document.body).backgroundColor || "#ffffff";

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: bgColor,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
    logging: false,
  });

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageW = pdf.internal.pageSize.getWidth();   // 297mm
  const pageH = pdf.internal.pageSize.getHeight();  // 210mm
  const margin = 8;

  let topOffset = margin;
  if (title) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text(title, pageW / 2, margin + 4, { align: "center" });
    topOffset = margin + 8;
  }

  const availableW = pageW - margin * 2;
  const availableH = pageH - topOffset - margin;

  // Fit while preserving aspect ratio.
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
  const y = topOffset + (availableH - drawH) / 2;

  const imgData = canvas.toDataURL("image/png");
  pdf.addImage(imgData, "PNG", x, y, drawW, drawH, undefined, "FAST");

  pdf.save(`${fileName}.pdf`);
}
