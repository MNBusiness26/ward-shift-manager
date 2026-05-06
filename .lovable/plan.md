# One stable invite link per employee

## Goal
Each staff member already has a unique, permanent invite token. Make the generated link point to the **published** app URL (public, no Lovable login required) instead of whatever URL the manager happens to be on (currently the editor preview, which blocks outsiders).

## Prerequisite (user action)
Click **Publish** in the top-right of the editor once to get a permanent public URL (e.g. `https://wardwise.lovable.app`). After that, frontend changes just need "Update" in the publish dialog.

## Changes

### 1. Store the public app URL as a setting
Use the existing `app_settings` table — no schema change needed.
- Key: `public_app_url`
- Value: e.g. `https://wardwise.lovable.app`

### 2. Add a small input in `src/pages/Admin.tsx`
A new card section "Public App URL" with:
- Input bound to the `public_app_url` setting
- Save button (reuses existing `saveSetting` mutation)
- Helper text: "The published URL where staff will sign in. Used to build invitation links."

### 3. Update `sendInvite` in `src/pages/Admin.tsx`
Replace:
```ts
return { url: `${window.location.origin}/auth?invite=${token}`, name: entry.full_name };
```
with:
```ts
const publicUrl = settings.find(s => s.key === 'public_app_url')?.value || window.location.origin;
return { url: `${publicUrl}/auth?invite=${token}`, name: entry.full_name };
```

### 4. (Optional polish) Warn if `public_app_url` is unset
If the setting is empty when the manager clicks Invite, show a toast: "Set the Public App URL in Admin first, otherwise the link will only work for logged-in Lovable collaborators."

## Result
- One permanent link per employee (token never changes on resend).
- Link points to the published site → anyone can open it, sign up, and get auto-claimed via the existing `handle_new_user` trigger.
- "Resend" reuses the same link.

## Files touched
- `src/pages/Admin.tsx` (add setting UI + use setting in `sendInvite`)
