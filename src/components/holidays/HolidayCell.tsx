import { forwardRef } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { PublicHoliday, HolidayCategory } from "@/hooks/useHolidays";
import { useTranslation } from "@/i18n/useTranslation";

// Inline SVG icons (Lucide doesn't have Star of David, Crescent, or Israeli flag)
const StarOfDavid = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="12,2 15,8 22,8 16.5,12 19,19 12,15 5,19 7.5,12 2,8 9,8" />
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

const IsraeliFlag = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="1" />
    <line x1="3" y1="8" x2="21" y2="8" />
    <line x1="3" y1="16" x2="21" y2="16" />
    <polygon points="12,10.2 13.6,12.9 10.4,12.9" />
    <polygon points="12,13.8 10.4,11.1 13.6,11.1" />
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
            "repeating-linear-gradient(45deg, rgba(239,68,68,0.10) 0 6px, transparent 6px 14px)",
        }
      : { backgroundColor: "rgba(239, 68, 68, 0.08)" };
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
  { holiday: PublicHoliday | undefined; size?: "sm" | "md" }
>(function HolidayCornerIcon({ holiday, size = "sm" }, ref) {
  const { locale } = useTranslation();
  if (!holiday) return null;
  const Icon = ICONS[holiday.category];
  const dim = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";
  const primary = locale === "he" ? holiday.name_he : holiday.name_en;
  const secondary = locale === "he" ? holiday.name_en : holiday.name_he;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            ref={ref}
            className="pointer-events-auto absolute top-1 end-1 ltr:right-1 ltr:left-auto rtl:left-1 rtl:right-auto z-10 inline-flex items-center justify-center rounded-sm text-destructive/70 hover:text-destructive"
            aria-label={primary}
          >
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
