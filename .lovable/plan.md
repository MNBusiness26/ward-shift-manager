## Goal
Make the published app URL (`https://ward-wise-shift-flow.lovable.app`) easy to grab and share from the Admin panel, so staff get the public link instead of the Lovable preview link.

## Changes

**`src/pages/Admin.tsx` — "Public App URL" card** (already exists, just enhance it):

1. Update the input placeholder to the actual published URL: `https://ward-wise-shift-flow.lovable.app`.
2. Add three buttons next to "Save URL":
   - **Use published default** — fills the field with `https://ward-wise-shift-flow.lovable.app`.
   - **Copy app link** — copies the current saved URL to clipboard (with toast confirmation).
   - **Open ↗** — opens the URL in a new tab so admin can verify it.
3. Add a short helper line: *"Share this link with staff so they sign up on the public app (no Lovable account required). Invitation links generated below are built from this URL."*

No DB changes, no new components. Existing `public_app_url` setting in `app_settings` is reused — invite links already use it as the base (`Admin.tsx` line 180).

## Result
From Admin → Public App URL card, you can:
- One-click set + save the published URL as the invite base.
- Copy the bare public link to paste into WhatsApp/email for any staff member.
- Open it to confirm it loads without a Lovable login wall.
