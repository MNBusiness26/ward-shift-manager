# WardWise Scheduler — Architecture: Drafts vs. Published Shifts

## Overview

WardWise uses a single `shifts` table with an `is_draft` boolean column to manage two visibility states: **draft** (work-in-progress) and **published** (live). Row-Level Security (RLS) enforces who sees what at the database level.

---

## Database Schema (shifts table)

| Column | Type | Purpose |
|---|---|---|
| `id` | uuid | Primary key |
| `date` | date | Shift date |
| `type` | enum (`morning`, `evening`, `night`) | Shift type |
| `start_time` / `end_time` | time | Shift hours |
| `assigned_user_id` | uuid (nullable) | FK → profiles.id |
| `is_draft` | boolean (default `true`) | **Draft vs. published flag** |
| `is_responsible_on_shift` | boolean | Responsible nurse marker |
| `manager_on_duty_id` | uuid (nullable) | Manager on duty |
| `comments` | text | Free-text notes |
| `color_code` | text | Optional visual override |

### Key: `is_draft`
- `true` → draft shift, visible only to managers in management views
- `false` → published shift, visible to all active staff everywhere

---

## Row-Level Security (RLS) Policies

Two policies on the `shifts` table control visibility:

### 1. "Active users can view published shifts" (SELECT)
```sql
USING (
  (NOT is_draft AND is_active_user(auth.uid()))
  OR has_role(auth.uid(), 'manager')
)
```
**Logic:** Regular staff see only published shifts (`is_draft = false`) AND must be active. Managers bypass the draft filter entirely — they see everything (drafts + published).

### 2. "Managers can manage shifts" (ALL)
```sql
USING (has_role(auth.uid(), 'manager'))
```
**Logic:** Only managers can INSERT, UPDATE, or DELETE shifts. Regular staff have read-only access.

### Visibility Matrix

| User Type | Draft Shifts | Published Shifts | Can Edit |
|---|---|---|---|
| Active Nurse/Assistant | ❌ Hidden | ✅ Visible | ❌ No |
| Manager (Master Roster / Mgmt Calendar) | ✅ Visible | ✅ Visible | ✅ Yes |
| Manager (My Calendar / Dashboard) | ❌ Filtered by app | ✅ Visible | ❌ No |
| Inactive User | ❌ Hidden | ❌ Hidden | ❌ No |

> **Note:** Managers' personal views (My Calendar, Dashboard) apply an additional client-side filter (`is_draft = false`) so managers see the same published schedule as staff in their personal context. Draft management is isolated to the Master Roster and Management Calendar.

---

## Security Helper Functions

- **`has_role(_user_id, _role)`** — SECURITY DEFINER function that checks `user_roles` table. Bypasses RLS to avoid recursive policy evaluation.
- **`is_active_user(_user_id)`** — SECURITY DEFINER function that checks `profiles.is_active`. Ensures deactivated accounts lose all shift visibility.

---

## Data Flow

### Publishing Flow (Manager)
```
Manager creates shifts (is_draft=true)
    ↓
Shifts appear only in Master Roster and Management Calendar (manager views)
    ↓
Manager clicks "Publish Drafts" (per-week bulk action)
    ↓
UPDATE shifts SET is_draft=false WHERE id IN (draft_ids)
    ↓
Shifts now visible to all active staff in My Calendar, Dashboard, etc.
```

### Full-Week Enforcement
The Master Roster includes an "Enforce Full Week Operations" toggle (default: ON). When enabled:
- **Publish Drafts** and **Clear Week** buttons are disabled unless the view is exactly a Sun–Sat week
- Prevents accidental partial-week operations
- The Management Calendar always operates on full weeks (Sun–Sat navigation)

### Clear Week Flow
```
Manager clicks "Clear Week" in Master Roster or Management Calendar
    ↓
Confirmation dialog warns about permanent deletion
    ↓
DELETE shifts WHERE date BETWEEN week_start AND week_end
    ↓
All shifts (draft and published) in that range are removed
```

### Draft Versioning Flow
```
Manager builds weekly schedule
    ↓
"Save" → upserts roster_versions (JSONB snapshot of all shifts for that week)
    ↓
"Save As..." → creates new named version (auto: draft_YYYY-MM-DD_vN, or custom name)
    ↓
"Load Version" → fetches snapshot, deletes current week's shifts, re-inserts from JSON
```

The `roster_versions` table stores snapshots:
| Column | Type | Purpose |
|---|---|---|
| `version_name` | text | e.g. `draft_2026-04-07_v1` |
| `week_start_date` | date | Monday of the week |
| `shifts_data` | jsonb | Full shift array snapshot |
| `created_by` | uuid | Manager who saved |

RLS: Only managers can read/write roster versions.

---

## UI Layer

### Manager View (Master Roster — `/roster`)
- **Top toolbar:** Publish Drafts, Clear Week, Add Shift
- **Settings row:** "Full week only" toggle, Bulk Assign, Copy/Paste Week
- **Grid:** Staff × Days matrix showing all shifts
  - **Draft shifts:** Light/pastel background, dashed border, `EyeOff` icon, 60% opacity
  - **Published shifts:** Darker/saturated background, solid border, `Lock` icon, full opacity
- **Bottom toolbar:** Save, Save As..., Load Version (with current version name display)
- **Shift creation:** New shifts default to `is_draft = true`
- **Publish toggle:** Per-shift switch in edit dialog flips `is_draft`

### Manager View (Management Calendar — `/management-calendar`)
- **Shift-type × Day grid:** Morning/Evening/Night rows with staff badges per cell
- **Top toolbar:** Publish Drafts, Clear Week, Bulk Assign, Add Shift
- **Visual indicators:**
  - Draft badges: 60% opacity, dashed border, "D" marker
  - Published badges: Full opacity, `Lock` icon, subtle ring accent
- **Cell interaction:** Empty cell → Bulk Assign; populated cell → detail panel

### Staff View (My Calendar — `/my-calendar`)
- Queries shifts where `assigned_user_id = current_user` AND `is_draft = false`
- Both RLS and client-side filter ensure only published shifts appear
- Staff never see draft shifts; they appear only after a manager publishes them
- **Collaborative context:** Day detail dialog shows:
  - The user's assigned role
  - A "Working with" list showing names of other staff on the same shift type/date

### Dashboard (Index — `/`)
- Shows upcoming 7-day shifts for the logged-in user
- Filters `is_draft = false` at query level — only published shifts appear
- Applies to all users including managers (consistent personal view)

---

## Visual Distinction: Draft vs. Published

### Shift Cell Styling (Master Roster)
| State | Background | Border | Opacity | Icon |
|---|---|---|---|---|
| Draft | `shift-type/10` (light pastel) | Dashed, `shift-type/25` | 60% | `EyeOff` |
| Published | `shift-type/30` (saturated) | Solid, `shift-type/60` | 100% | `Lock` |

### Badge Styling (Management Calendar)
| State | Style | Indicator |
|---|---|---|
| Draft | `opacity-60 border-dashed` | "D" text marker |
| Published | Full opacity, `ring-1` accent | Lock icon |

---

## Key Design Decisions

1. **Database-level enforcement:** Visibility is enforced by RLS, not frontend filtering. Even if a nurse calls the API directly, draft shifts are invisible.
2. **Client-side consistency for managers:** Managers' personal views (Dashboard, My Calendar) add `is_draft = false` filter so they see the same schedule as staff.
3. **Single table:** Drafts and published shifts live in the same `shifts` table (no separate staging table). The `is_draft` boolean is the sole differentiator.
4. **Snapshot versioning:** Draft versions are stored as JSONB snapshots in `roster_versions`, not as separate shift records. Loading a version replaces the current week's shifts.
5. **SECURITY DEFINER functions:** `has_role()` and `is_active_user()` prevent RLS recursion when policies reference other RLS-protected tables.
6. **Full-week enforcement:** Bulk operations (Publish, Clear) can be restricted to complete Sun–Sat weeks to prevent partial-week accidents.
