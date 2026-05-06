## Problem

When you switch into QA "View as" mode and pick ניימן מיכל, the dashboard at `/` stays empty even though she has shifts in the next 7 days.

Root cause is in `src/pages/Index.tsx`. All the data queries are scoped by `user!.id`, which is the real authenticated admin's auth user id — not the impersonated profile's id:

- `dash-my-shifts` filters `assigned_user_id = user.id`
- `dash-my-avail` filters `user_id = user.id`
- `dash-swaps` filters by `requesting_user_id` / `covering_user_id = user.id`

The `AuthContext` already exposes the impersonated profile via `profile` (the "effective" profile), but the dashboard ignores it and uses `user.id` directly. So in QA mode it keeps loading the admin's data, which is empty for next week.

The greeting also uses `profile.full_name`, which already updates correctly — that's why the header reads "שלום, אחות ניימן מיכל" while the lists below remain empty.

## Fix

In `src/pages/Index.tsx`, derive a single `viewUserId` and use it everywhere the queries currently use `user.id`:

```ts
const { user, profile, roles, isImpersonating } = useAuth();
const viewUserId = profile?.id ?? user?.id;
```

Then:
- Replace `user!.id` / `user?.id` in the four `useQuery` calls (`dash-my-shifts`, `dash-all-shifts` enable check, `dash-my-avail`, `dash-swaps`) with `viewUserId`.
- Include `viewUserId` (and optionally `isImpersonating`) in each `queryKey` so React Query refetches when the admin switches the impersonated user.
- Use `viewUserId` in the "teammates excludes me" filter (`getTeammates`) and in the swap partitioning (`swapsToAction`, `swapsSent`) so the simulated staff view matches what that nurse would actually see.
- Keep `acceptSwap` writing `covering_user_id: user!.id` (the real admin) — but gate the button with `confirmIfImpersonating("Accept swap")` so accidental QA actions are caught, consistent with the existing safety pattern in Roster/Admin.

## Files to edit

- `src/pages/Index.tsx` — only file changed.

## Out of scope

- No schema, RLS, or AuthContext changes. The admin's session keeps full read access via the manager RLS policies, so querying for another user's id from the admin session works without policy changes.
- Other pages (MyCalendar, MyStats, Availability, SwapRequests) likely have the same `user.id` vs effective-profile mismatch under QA mode, but the user only reported the dashboard. We can address those separately if desired.
