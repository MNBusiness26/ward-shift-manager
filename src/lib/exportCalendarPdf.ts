import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface ExportOptions {
  /** The DOM element to capture (the calendar container). */
  element: HTMLElement;
  /** Filename WITHOUT extension. */
  fileName: string;
  /** Optional title — currently ignored to avoid font/encoding issues with non-Latin scripts. */
  title?: string;
  /** Page orientation. Defaults to landscape. */
  orientation?: "landscape" | "portrait";
  /** Page format. Defaults to A4. Use A3 for dense month views. */
  format?: "a4" | "a3";
  /** Force a text direction inside the cloned sandbox (rtl preserves icon alignment for Hebrew). */
  direction?: "ltr" | "rtl";
}

/**
 * Render the calendar into a hidden, fixed-width "sandbox" clone with print-tuned
 * CSS, then rasterize to a single-page PDF. Cloning avoids fighting with the
 * live responsive layout (vh heights, flex-1, narrow columns) that causes the
 * cramped/overlapping output we saw before.
 */
export async function exportCalendarToPdf({
  element,
  fileName,
  orientation = "landscape",
  format = "a4",
  direction,
}: ExportOptions) {
  const bgColor = getComputedStyle(document.body).backgroundColor || "#ffffff";

  // A3 landscape gets a wider sandbox so dense month grids breathe.
  const SANDBOX_WIDTH = format === "a3" && orientation === "landscape" ? 1600 : 1200;

  // Detect direction from the live element if not forced.
  const liveDir =
    direction ||
    (getComputedStyle(element).direction === "rtl" ? "rtl" : "ltr");

  // Build the hidden sandbox container.
  const sandbox = document.createElement("div");
  sandbox.setAttribute("data-pdf-sandbox", "true");
  sandbox.style.position = "fixed";
  sandbox.style.top = "0";
  sandbox.style.left = "-10000px";
  sandbox.style.width = `${SANDBOX_WIDTH}px`;
  sandbox.style.background = bgColor;
  sandbox.style.zIndex = "-1";
  sandbox.style.pointerEvents = "none";
  sandbox.dir = liveDir;

  // Clone the calendar element deeply.
  const clone = element.cloneNode(true) as HTMLElement;
  clone.setAttribute("data-pdf-export", "true");
  clone.style.width = `${SANDBOX_WIDTH}px`;
  clone.style.maxWidth = `${SANDBOX_WIDTH}px`;
  clone.style.minWidth = `${SANDBOX_WIDTH}px`;
  clone.style.height = "auto";
  clone.style.minHeight = "0";
  clone.style.maxHeight = "none";
  clone.style.overflow = "visible";

  sandbox.appendChild(clone);

  // Print-tuned style sheet scoped to the sandbox.
  const style = document.createElement("style");
  style.id = "calendar-pdf-export-styles";
  style.textContent = `
    [data-pdf-sandbox="true"] { direction: ${liveDir}; }
    [data-pdf-export="true"], [data-pdf-export="true"] * {
      box-sizing: border-box !important;
      animation: none !important;
      transition: none !important;
    }
    [data-pdf-export="true"] .overflow-hidden,
    [data-pdf-export="true"] .overflow-x-auto,
    [data-pdf-export="true"] .overflow-y-auto,
    [data-pdf-export="true"] .truncate {
      overflow: visible !important;
      text-overflow: clip !important;
    }

    /* Force fixed table layout with even column widths. */
    [data-pdf-export="true"] table {
      width: 100% !important;
      table-layout: fixed !important;
      border-collapse: collapse !important;
      height: auto !important;
      min-height: 0 !important;
    }
    [data-pdf-export="true"] thead th {
      font-size: 12px !important;
      padding: 6px 4px !important;
      page-break-inside: avoid;
    }

    /* Cell sizing: explicit min height, no vh, no flex collapse. */
    [data-pdf-export="true"] tbody tr { height: auto !important; }
    [data-pdf-export="true"] tbody td {
      height: auto !important;
      min-height: 180px !important;
      vertical-align: top !important;
      padding: 4px !important;
      page-break-inside: avoid;
    }
    /* Dense cells (>5 staff) trim padding to keep contents inside the cell. */
    [data-pdf-export="true"] tbody td.pdf-dense {
      min-height: 200px !important;
      padding: 2px !important;
    }
    [data-pdf-export="true"] tbody td.pdf-dense .calendar-shift-box {
      padding: 2px 3px !important;
    }

    /* Shift type label */
    [data-pdf-export="true"] .calendar-shift-box {
      padding: 4px 5px !important;
      margin-bottom: 3px !important;
      page-break-inside: avoid;
    }

    /* Staff list & badges */
    [data-pdf-export="true"] .calendar-staff-list {
      display: flex !important;
      flex-direction: column !important;
      gap: 3px !important;
      min-width: 0 !important;
    }
    [data-pdf-export="true"] .calendar-staff-badge {
      display: inline-flex !important;
      align-items: center !important;
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      min-height: 20px !important;
      padding: 2px 6px !important;
      white-space: nowrap !important;
      line-height: 16px !important;
      font-size: 10px !important;
      border-radius: 4px !important;
      gap: 4px !important;
    }
    [data-pdf-export="true"] .calendar-staff-name {
      min-width: 0 !important;
      flex: 1 1 auto !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      line-height: 16px !important;
      font-size: 10px !important;
    }
    [data-pdf-export="true"] .calendar-staff-badge svg {
      width: 10px !important;
      height: 10px !important;
      flex: 0 0 auto !important;
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(sandbox);

  // Tag dense cells (>5 staff badges) so CSS can tighten them.
  clone.querySelectorAll("tbody td").forEach((td) => {
    const count = td.querySelectorAll(".calendar-staff-badge").length;
    if (count > 5) td.classList.add("pdf-dense");
  });

  // Allow layout to settle.
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  await new Promise((r) => setTimeout(r, 50));

  const sandboxHeight = Math.max(clone.scrollHeight, clone.offsetHeight, 600);

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      backgroundColor: bgColor,
      width: SANDBOX_WIDTH,
      height: sandboxHeight,
      windowWidth: SANDBOX_WIDTH,
      windowHeight: sandboxHeight,
      logging: false,
    });
  } finally {
    sandbox.remove();
    style.remove();
  }

  const pdf = new jsPDF({ orientation, unit: "mm", format });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
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
