# Roster Grid: Sticky Header + Better Cell Borders

Two small, focused fixes to `src/pages/Roster.tsx` (the Shift Manager grid).

## 1. Pin the weekday header to the top while scrolling

Today the `<thead>` row (weekdays + date + fulfillment summary) scrolls away with the page. The table uses `border-separate` so `position: sticky` on `<th>` works cleanly.

Changes to the header cells in the `<thead>`:
- Add `sticky top-0 z-30` to every weekday `<th>` (line 880) so they pin to the viewport top.
- Bump the staff-column header `<th>` (line 874) to `sticky left-0 top-0 z-40` so the top-left corner stays above both the sticky row and sticky column on intersection.
- Keep the existing background colors (`bg-card`, `bg-muted/50` for blocked) so content scrolling underneath does not bleed through.

Note: the surrounding `CardContent` uses `overflow-hidden` and the inner wrapper uses `overflow-x-auto`. Sticky-to-page-top works because neither ancestor sets `overflow-y`. Verified by reading lines 865-871. No layout container changes needed.

## 2. Make the per-cell grid lines slightly more visible

Current borders use `border-border/20` (body cells) and `border-border/30` (header cells), which on the white card background render almost invisibly — especially the horizontal line separating staff rows.

Bump the opacity one notch for better contrast while staying subtle:
- Header cells: `border-border/30` → `border-border/60` (lines 874, 880).
- Body shift cells: `border-border/20` → `border-border/50` (lines 953, 1029).
- Staff name column right border: keep current `border-r` but standardize to `border-r border-border/60` so it visually matches.
- Unassigned summary row: same `border-border/50` treatment (line 1029).

This lifts contrast roughly 2-3× without introducing heavy "spreadsheet" lines.

## Technical notes

- File touched: `src/pages/Roster.tsx` only.
- No CSS additions needed (`index.css` untouched). Tailwind's arbitrary opacity on `border-border/N` already supports these values.
- `border-separate border-spacing-0` (line 871) is required for sticky `<th>` borders to stay attached during scroll — already in place.
- RTL: existing `[dir="rtl"] .sticky.left-0` rule in `index.css` flips the sticky staff column; sticky `top-0` is direction-agnostic, so Hebrew layout is unaffected.

## Out of scope

- No change to draft stripes, shift colors, or fulfillment badges.
- No change to ManagementCalendar or other grids (only the Roster/Shift Manager view per the request).
