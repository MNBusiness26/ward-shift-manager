## Fix QA-mode Management menu visibility

**Single change** in `src/contexts/AuthContext.tsx` — `impersonate()` callback.

When the impersonated profile has no rows in `user_roles` (because they're a placeholder profile auto-created by shift assignment and haven't signed up yet — the FK to `auth.users` blocks pre-creating the role), fall back to `profiles.role`. This makes QA preview match the post-signup experience that `handle_new_user` will produce.

```ts
.then(({ data }) => {
  const dbRoles = (data?.map(r => r.role) ?? []) as AppRole[];
  if (dbRoles.length > 0) { setImpersonatedRoles(dbRoles); return; }
  const fallback = p.role as AppRole | null;
  const valid: AppRole[] = ["manager","assistant_manager","team_leader","nurse","assistant"];
  setImpersonatedRoles(fallback && valid.includes(fallback) ? [fallback] : []);
});
```

### Unchanged
- Sidebar gate stays `isManager || isAssistantManager` — only manager + assistant_manager (and you as admin) see Management. team_leader / nurse / assistant do not.
- Real-login path (`fetchRoles`) untouched.
- No DB migration (FK to auth.users prevents backfill; not needed — signup trigger handles it).

### Verify after build
- QA as מזרחי ליהיא → Management visible incl. Payroll.
- QA as ניימן מיכל → Management visible, Payroll hidden.
- QA as a nurse → Management hidden.
