## Fix: Impersonation triggers "Account Pending Activation"

### Root cause
`ProtectedRoute` in `src/App.tsx` uses `isActive` and `hasProfile` from `useAuth()` to gate the app. Currently `AuthContext` derives both from the *effective* (impersonated) profile. If the impersonated user has `is_active = false` (most pending/unclaimed staff), the admin gets bounced to `PendingActivation`. The same risk applies to `hasProfile` if the lookup ever fails.

The real admin's session is fully active — impersonation should only affect role/permission *views*, not the activation gate itself.

### Change
In `src/contexts/AuthContext.tsx`, when impersonating, derive these from the **real** logged-in admin profile, not the impersonated one:

- `isActive` → always from `profile?.is_active` (real admin)
- `hasProfile` → always from real `profile !== null`

Everything else (`profile` returned to consumers, `roles`, `isManager`, `isAssistantManager`) keeps using the impersonated values so the UI continues to render the staff perspective.

### Technical detail
```ts
const hasProfile = profile !== null;                  // real
const isActive  = profile?.is_active ?? false;        // real
// effectiveProfile / effectiveRoles still used for profile + role flags
```

No other files need changes. The `ImpersonationBar` and sidebar badge already work correctly.