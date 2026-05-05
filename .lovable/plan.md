## Friction Settings — Admin Panel

Add a new **Friction & Validation** section to `/admin` that controls every conflict/FTE check we listed. When the master toggle is **ON**, behavior is unchanged (warnings shown via `FrictionDialog`). When **OFF**, validations still run silently in the background and are logged for analytics, but the dialog never blocks the save.

---

### 1. Storage — single `app_settings` row

Reuse the existing `app_settings` table (no schema change). One new key:

```
key: "friction_config"
value: {
  enabled: true,                 // master switch — when false, save proceeds silently
  log_when_disabled: true,       // still record violations in friction_log
  checks: {
    fte_weekly:    { enabled: true,  severity: "yellow" },
    excluded_shifts:{ enabled: true, severity: "yellow" },
    excluded_days: { enabled: true,  severity: "yellow" },
    rest_period:   { enabled: true,  severity: "red", min_hours: 8 },
    headcount:     { enabled: true,  severity: "yellow" }
  },
  fte_shifts_per_week: 5         // formula constant (currently hard-coded)
}
```

Headcount targets stay in their existing `headcount_limits` setting (already configurable).

### 2. New table — `friction_log` (background tracking)

Lightweight insert-only table so we can review what *would* have warned even when warnings are disabled.

```
friction_log:
  id            uuid pk
  shift_id      uuid (nullable — pre-save violations may not have an id yet)
  user_id       uuid (assigned staff)
  created_by    uuid (manager who saved)
  date          date
  shift_type    text
  warning_type  text   ("fte" | "rest" | "role_rule" | "headcount")
  severity      text   ("yellow" | "red")
  message       text
  was_shown     boolean  // true if the dialog was actually displayed
  was_overridden boolean // true if user clicked "save anyway"
  created_at    timestamptz default now()
```

RLS: managers can read all, anyone authenticated can insert their own (created_by = auth.uid()).

### 3. Validation flow changes

`validateShiftFriction()` already returns a list of warnings. We wrap the call sites (`Roster.tsx`, `ManagementCalendar.tsx`) in a small helper:

```text
runFrictionGate(warnings):
  log all warnings to friction_log (was_shown = config.enabled)
  if !config.enabled: return { proceed: true }
  if warnings.length: open FrictionDialog → user choice
  else: return { proceed: true }
```

Each individual check inside `validateShiftFriction` reads its `checks.<name>.enabled` flag and short-circuits if disabled. `MIN_REST_HOURS` becomes `config.checks.rest_period.min_hours`. `fteLimit` uses `config.fte_shifts_per_week`.

`PublishConfirmDialog` (the publish-time FTE recheck) and the headcount highlighting in the Management Calendar grid also respect the same toggles — when disabled, they don't surface warnings but still update `friction_log`.

### 4. Admin UI — new card on `/admin`

```
┌─ Friction & Validation ─────────────────────────────┐
│ [✓] Enable friction warnings (master)               │
│ [✓] Track violations silently when disabled         │
│                                                     │
│ Per-check controls:                                 │
│  • FTE weekly limit          [on/off] severity ▾    │
│  • Excluded shift types      [on/off] severity ▾    │
│  • Excluded weekdays         [on/off] severity ▾    │
│  • Back-to-back rest         [on/off] severity ▾    │
│      Minimum rest hours: [ 8 ]                      │
│  • Headcount over-staffing   [on/off] severity ▾    │
│      (capacity numbers in existing Headcount card)  │
│                                                     │
│ Formula:                                            │
│   Shifts per week at 100% FTE: [ 5 ]                │
│                                                     │
│ [Save Friction Settings]                            │
└─────────────────────────────────────────────────────┘
```

A second small card links to a **Friction Log** view (last 100 entries, filterable by date/user/type) so managers can audit silent violations.

### 5. Hook

New `useFrictionConfig()` hook (parallel to `useAppSettings`) that returns the parsed config with safe defaults so any missing keys behave like "all on".

---

### Files to add / modify

**New**
- `supabase` migration: create `friction_log` table + RLS + index on `(date, user_id)`
- `src/hooks/useFrictionConfig.ts`
- `src/lib/frictionLog.ts` — `logFrictionWarnings(...)`
- `src/components/admin/FrictionSettingsPanel.tsx`
- `src/components/admin/FrictionLogPanel.tsx` (optional, can be phase 2)

**Modified**
- `src/components/roster/frictionValidation.ts` — accept config, gate each check
- `src/pages/Roster.tsx` — wrap save in `runFrictionGate`, log results
- `src/pages/ManagementCalendar.tsx` — same wrap + gate headcount highlight
- `src/components/roster/PublishConfirmDialog.tsx` — read config for FTE recheck
- `src/pages/Admin.tsx` — mount `FrictionSettingsPanel`

---

### Phasing suggestion

1. **Phase 1 (small):** master on/off toggle + per-check enable flags + `friction_log` insert. No severity / min-hours editor yet.
2. **Phase 2:** per-check severity selector, configurable rest hours, FTE-per-week constant.
3. **Phase 3:** Friction Log viewer in Admin with filters.

Want me to proceed with Phase 1, or all three at once?
