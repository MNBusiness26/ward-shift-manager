## Problem

QA Mode (impersonation) currently only swaps the *displayed* profile. Most nurse-facing pages still query and mutate using `user.id` (the real admin's auth uid), so when you "View as" another nurse:

- **SwapRequests** loads *your own* shifts in the swap dialog, not the impersonated user's → that's why their shifts don't appear.
- **Availability** loads/inserts requests under your own `user_id`.
- **MyStats** and **Index dashboard mutations** (accept swap) also use `user.id`.
- **MyCalendar** is partially correct (uses `profile?.id`) but `useMyShifts` already reads from `profile.id`, so it works.

The fix is to consistently use the **effective profile id** (`profile.id`, which already returns the impersonated profile when in QA mode via `AuthContext`) for all "viewer scope" reads and writes on these pages. Manager RLS policies already permit admin to insert rows on behalf of other users for both `availability_requests` and `swap_requests`, so writes will succeed without backend changes.

## Scope

Pages to update so they fully respect impersonation:

1. **`src/pages/SwapRequests.tsx`**
   - Replace every `user!.id` / `user?.id` with the effective `profile.id`.
   - Affects: `myShifts` query, `swapRequests` query (`.or(...)`), `colleagues` query (`.neq("id", ...)`), `createSwap` (`requesting_user_id`), `acceptSwap` / `respondToPool` (`covering_user_id`), `cancelSwap`, and the JSX filters/conditions (`canCancel`, pool filter, my-requests filter, "accept" button gate).
   - Wrap mutation triggers (`createSwap.mutate`, `acceptSwap.mutate`, `respondToPool.mutate`, `cancelSwap.mutate`) in `confirmIfImpersonating(...)` so the admin gets a clear warning before writing as another user.

2. **`src/pages/Availability.tsx`**
   - Replace `user!.id` / `user.id` in the `availability-requests` query and the two `INSERT`s with the effective `profile.id`.
   - Wrap `createRequest.mutate` and `deleteRequest.mutate` in `confirmIfImpersonating(...)`.

3. **`src/pages/MyStats.tsx`**
   - Switch the two queries from `user!.id` to `profile.id` so stats reflect the impersonated user.

4. **`src/pages/Index.tsx`** (dashboard)
   - `acceptSwap` mutation already uses `user!.id` for `covering_user_id` — change to effective `profile.id` and gate with `confirmIfImpersonating`.
   - Reads already use `viewUserId = profile?.id ?? user?.id`, no change needed.

5. **`src/pages/MyCalendar.tsx`**
   - Already uses `profile.id` via hooks — verify only; no change required.

## Behavior after fix

In QA Mode the admin can:
- See the impersonated user's upcoming shifts inside the "Request a Swap" dialog and submit a swap as them (direct or pool).
- Submit / cancel availability and preference requests as them.
- View their stats and accept pool offers / direct swaps targeting them.

Each write triggers the existing "QA Mode — perform as a real action?" confirm dialog so the admin can't accidentally create live records.

## Notes

- No DB / RLS / edge function changes are needed: managers already have ALL-row policies on `swap_requests` and explicit insert/update/delete policies on `availability_requests`.
- Activation/role gating in `ProtectedRoute` continues to use the real admin session, so impersonating an inactive user won't lock the admin out.
