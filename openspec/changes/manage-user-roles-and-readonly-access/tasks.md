# Tasks

## 1. Database authorization and invariants

- [ ] 1.1 Add a forward migration under `supabase/migrations/` that restricts document edit/manage helpers to active admins/editors, preserves read policy, and removes direct authenticated profile UPDATE; verify role-specific API requests deny reader/reviewer writes, including owner and legacy edit-grant cases, while authorized editor/admin operations still work.
- [ ] 1.2 Add a service-role-only transactional profile-access RPC plus a database guard for the last active admin; verify concurrent demotion/deactivation attempts cannot leave zero active admins and self-demotion/self-deactivation is rejected.
- [x] 1.3 Document migration/deployment prerequisites and the rollback boundary in `README.md`; verify the documented sequence keeps at least one active admin and does not require re-enabling direct profile UPDATE.
- [ ] 1.4 Add a forward migration for access-request kind and terminal `reactivated` status, backfilling existing rows as registrations; implement atomic submit/claim/complete operations for reactivation and atomic closure on direct admin activation. Verify terminal rows reopen as pending, duplicate pending submissions leave timestamps and rate-limit counters unchanged, concurrent actions have one winner, and rejected requests leave the profile inactive.

## 2. Administrative access API and UI

- [ ] 2.1 Add `supabase/functions/manage-user-access/index.ts` and its `supabase/config.toml` entry using the existing origin/JWT pattern; verify active admins can change another user's role/status and 400/401/403/409 responses cover malformed, anonymous, non-admin, self-change, and last-admin requests.
- [ ] 2.2 Add admin-only user-list and mutation methods to `src/auth/AuthContext.jsx`, refreshing the list after changes; verify a non-admin cannot obtain the list via the UI or direct API and no service key reaches the browser bundle.
- [ ] 2.3 Add `Usuarios y roles` to the account menu and an accessible management dialog in `src/App.jsx`/`src/App.css` (or the existing stylesheet), showing name/email/role/status and only `admin`/`editor`/`reader` choices; verify role and status changes, clear errors, disabled self-demotion/deactivation, and no assignable `reviewer` option in a browser.
- [x] 2.4 Document admin role/status operations and their separation from first-access approval in `README.md`; verify the instructions match the available dialog and the invite flow remains unchanged.
- [ ] 2.5 Add authenticated `request-reactivation` Edge Function and `AuthContext` method that use verified account identity, require an inactive matching profile, and never send email; verify anonymous/active/missing-profile requests fail, terminal requests reopen, and duplicate pending requests are idempotent.
- [ ] 2.6 Extend `review-access-request` to branch on request kind, approving reactivation by activating the existing profile without Auth invite/reset calls and rejecting without activation; verify first-access approval still sends its existing email and simultaneous reviews cannot diverge.
- [ ] 2.7 Update `AuthGate` pending-access copy/action and the administrator request list to show reactivation separately from registration; verify a known inactive user sees reactivation messaging, profile-load errors do not offer a request action, and admins can approve/reject the distinguished request.
- [ ] 2.8 Update `README.md` with the reactivation lifecycle, direct-admin-activation reconciliation, and mail-free approval distinction; verify the documented flow matches both interfaces and the deployed function configuration.

## 3. Read-only editor

- [ ] 3.1 Derive one edit capability from the active profile in `src/App.jsx`, guard `mutate`, `createNew`, and `handleImport`, and refresh profile authorization on return to the app in `src/auth/AuthContext.jsx`; verify reader/reviewer calls cannot alter local document state, including direct New/Import paths, while admin/editor behavior remains intact.
- [ ] 3.2 Propagate read-only/disabled behavior through editable fields, tables, technical profile, subapartados, and all add/remove/move/toggle controls in `src/App.jsx` and styles; verify every section stays navigable/copyable/exportable for a reader but no document mutation is possible by mouse or keyboard.
- [ ] 3.3 Make Información del documento > Estado role-dependent without modifying the document schema or export status; verify readers/reviewers see `Sólo lectura` and editors/admins see `En edición`.
- [ ] 3.4 Document the local-only editor boundary and reader capabilities in `README.md`; verify `pnpm build` succeeds and the documented reader/editor browser smoke checks pass.

## 4. Integration verification

- [ ] 4.1 Exercise the deployed migration, Edge Function, and UI together with active admin/editor/reader plus legacy reviewer accounts; verify permission changes take effect for an already open session on focus, API writes are denied immediately, exports still work, and existing Google/invitation/password flows regress neither access nor redirects.
- [ ] 4.2 Exercise end-to-end reactivation with a previously invited or rejected inactive account, repeated pending submission, direct admin activation, admin approval, and admin rejection; verify request type/status and profile remain consistent, no reactivation email is sent, and first-access invitations still work.
