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
- `true` → draft shift, visible only to managers
- `false` → published shift, visible to all active staff

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
| Manager | ✅ Visible | ✅ Visible | ✅ Yes |
| Inactive User | ❌ Hidden | ❌ Hidden | ❌ No |

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
Shifts appear only in Master Roster (manager view)
    ↓
Manager clicks "Publish" toggle per shift or bulk
    ↓
UPDATE shifts SET is_draft=false
    ↓
Shifts now visible to all active staff in My Calendar, Dashboard, etc.
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
- **Top toolbar:** Bulk Assign, Copy/Paste Week
- **Grid:** Staff × Days matrix showing all shifts (drafts shown with `EyeOff` icon + "Draft" badge)
- **Bottom toolbar:** Save, Save As..., Load Version (with current version name display)
- **Shift creation:** New shifts default to `is_draft = true`
- **Publish toggle:** Per-shift switch in edit dialog flips `is_draft`

### Staff View (My Calendar — `/my-calendar`)
- Queries shifts where `assigned_user_id = current_user`
- RLS automatically filters out drafts — the frontend doesn't need to filter
- Staff never see draft shifts; they appear only after a manager publishes them

### Dashboard (Index — `/`)
- Shows upcoming 7-day shifts for the logged-in user
- Same RLS filtering applies — only published shifts appear

---

## Key Design Decisions

1. **Database-level enforcement:** Visibility is enforced by RLS, not frontend filtering. Even if a nurse calls the API directly, draft shifts are invisible.
2. **Single table:** Drafts and published shifts live in the same `shifts` table (no separate staging table). The `is_draft` boolean is the sole differentiator.
3. **Snapshot versioning:** Draft versions are stored as JSONB snapshots in `roster_versions`, not as separate shift records. Loading a version replaces the current week's shifts.
4. **SECURITY DEFINER functions:** `has_role()` and `is_active_user()` prevent RLS recursion when policies reference other RLS-protected tables.
