import { forwardRef } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { PublicHoliday, HolidayCategory } from "@/hooks/useHolidays";
import { useTranslation } from "@/i18n/useTranslation";

// Inline SVG icons (Lucide doesn't have Star of David, Crescent, or Israeli flag)
// True 6-pointed Star of David: two overlapping equilateral triangles (hexagram)
const StarOfDavid = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
    <polygon points="12,2 21,18 3,18" />
    <polygon points="12,22 3,6 21,6" />
  </svg>
);

const Crescent = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 14.5A8 8 0 1 1 11 4a6.5 6.5 0 0 0 9 10.5z" />
  </svg>
);

const Dove = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 13c4 0 6-2 9-2 2 0 4 1 4 3 0 1-1 2-3 2H8l-1 4-2-1 1-3c-2 0-3-1-3-3z" />
    <path d="M16 9l3-3-1 4 3 1-4 1" />
  </svg>
);

// Israeli flag in true colors (white background, blue stripes & Star of David)
const IsraeliFlag = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <rect x="2.5" y="5" width="19" height="14" rx="1" fill="#ffffff" stroke="#0038b8" strokeWidth="0.6" />
    <rect x="2.5" y="6.5" width="19" height="2" fill="#0038b8" />
    <rect x="2.5" y="15.5" width="19" height="2" fill="#0038b8" />
    <g fill="none" stroke="#0038b8" strokeWidth="0.9" strokeLinejoin="round">
      <polygon points="12,9.2 14.6,13.6 9.4,13.6" />
      <polygon points="12,14.4 9.4,10 14.6,10" />
    </g>
  </svg>
);

const WardIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21s-7-4.5-7-10a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 5.5-7 10-7 10z" />
  </svg>
);

const ICONS: Record<HolidayCategory, React.FC<{ className?: string }>> = {
  national: IsraeliFlag,
  jewish: StarOfDavid,
  muslim: Crescent,
  christian: Dove,
  ward: WardIcon,
};

/**
 * Background overlay for a calendar cell.
 * - Chag: solid soft red
 * - Erev (eve): 45deg repeating red stripes
 * Sits absolutely inside the cell (which must be `position: relative`).
 */
export const HolidayCellBackground = forwardRef<HTMLDivElement, { holiday: PublicHoliday | undefined }>(
  function HolidayCellBackground({ holiday }, ref) {
    if (!holiday) return null;
    const style: React.CSSProperties = holiday.is_eve
      ? {
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(159,102,204,0.14) 0 6px, transparent 6px 14px)",
        }
      : { backgroundColor: "rgba(159, 102, 204, 0.08)" };
    return (
      <div
        ref={ref}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={style}
      />
    );
  },
);

/**
 * Top-corner icon (opposite the day number).
 * In LTR, day-number is top-left → icon goes top-right.
 * In RTL, day-number is top-right → icon goes top-left.
 * Wrapped with tooltip showing both names.
 */
export const HolidayCornerIcon = forwardRef<
  HTMLSpanElement,
  { holiday: PublicHoliday | undefined; size?: "sm" | "md"; inline?: boolean }
>(function HolidayCornerIcon({ holiday, size = "sm", inline = false }, ref) {
  const { locale } = useTranslation();
  if (!holiday) return null;
  const Icon = ICONS[holiday.category];
  const dim = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  const primary = locale === "he" ? holiday.name_he : holiday.name_en;
  const secondary = locale === "he" ? holiday.name_en : holiday.name_he;

  const positioning = inline
    ? "inline-flex items-center justify-center"
    : "pointer-events-auto absolute top-1 end-1 ltr:right-1 ltr:left-auto rtl:left-1 rtl:right-auto z-10 inline-flex items-center justify-center rounded-sm text-[#9F66CC]/80 hover:text-[#9F66CC]";

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span ref={ref} className={positioning} aria-label={primary}>
            <Icon className={dim} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div className="font-medium">{primary}</div>
          {secondary && secondary !== primary && (
            <div className="text-muted-foreground">{secondary}</div>
          )}
          {holiday.is_eve && <div className="text-[10px] opacity-70 mt-0.5">Erev / ערב</div>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
