## What's actually happening

Michal signed in with Google successfully (auth user `cc13c91e…` exists, confirmed at 17:08 today). The `handle_new_user` trigger should have:
1. Found her `staff_directory` row (`michusha@gmail.com`, role `assistant_manager`)
2. Created her `profiles` row with `is_active=true`
3. Created her `user_roles` row
4. Marked the directory row `is_claimed=true`

None of that happened — `profiles` and `user_roles` are empty for her id, and `staff_directory.is_claimed` is still `false`. So when she logs in, `AuthContext` sees no profile → `RestrictedAccess` page → "request access" mailto link (which just opens email to you, nothing is stored).

I haven't found the exact reason the trigger no-op'd for her (the trigger is installed on `auth.users` and the email matches case-insensitively). Likely the directory row was edited/recreated after she signed up, or a prior signup attempt already consumed the match. Either way, **there is no built-in admin UI to recover from this today** — that's the gap to fix.

## Plan

### 1. Backfill Michal right now (one-off SQL migration)
- Insert into `profiles`: id = her auth uid, full_name/email/role/fte from `staff_directory`, `is_active=true`, department `Children's Ward`.
- Insert into `user_roles`: `(her_uid, 'assistant_manager')`.
- Update `staff_directory` row: `is_claimed=true`, `claimed_by=her_uid`.

After this she just refreshes and is in.

### 2. Add "Pending sign-ins" panel to `src/pages/Admin.tsx`
A new card listing every `auth.users` row that has no matching `profiles` row — i.e. people stuck on the RestrictedAccess screen. For each row show email, sign-up date, and:
- **Link to directory entry** dropdown (only entries where `is_claimed=false`) → on confirm, runs the same backfill (create profile + role, mark directory claimed). They get instant access on next refresh.
- **Dismiss** (delete the auth user) for spam/unknown sign-ups.

### 3. Backend for that panel: new edge function `admin-pending-signups`
Client can't read `auth.users`. Add a Supabase edge function (service role) with two actions:
- `list` → returns auth users that have no `profiles` row (id, email, created_at, full_name from metadata).
- `link` → input `{ auth_user_id, directory_id }`. Verifies caller is manager via `has_role`, then performs the backfill atomically.
- `dismiss` → deletes the auth user (manager-only).

Function checks the caller's JWT and confirms `has_role(auth.uid(), 'ward_manager')` before doing anything.

### 4. Tighten the trigger so this doesn't recur
Update `handle_new_user` to also handle the case where `is_claimed=true` but `claimed_by` matches no profile (re-link), and add a fallback: if no directory match, still create a `profiles` row with `is_active=false` so the user shows up in the existing Staff page's pending list instead of vanishing into auth-only limbo. The existing Staff "Pending activation" UI then becomes the second safety net.

## Result
- Michal gets in immediately after step 1.
- For any future signup that slips through, you'll see them in **Admin → Pending sign-ins** and can link them to their directory entry with one click — no SQL, no support email.
