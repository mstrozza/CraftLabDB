# Design

## Context

See [proposal.md](proposal.md). `AuthContext` already loads `profiles.role` and `is_active`; `AuthGate` admits only active accounts. Its inactive-account screen currently calls the anonymous `request-access` path, whose duplicate-ignoring upsert cannot reopen a prior terminal request. `access_requests` has one row per email and does not distinguish a new registration from reactivation. `review-access-request` sends an invitation or recovery email on approval. `App.jsx` keeps the current document in React state. Most edits pass through `mutate`, while New and Import replace state directly. The existing Supabase document repository is not connected to this editor. Database RLS permits an active reader who owns a document or has an old edit grant to call update/delete APIs because `can_edit_document` and `can_manage_document` do not check the role. The current `profiles_admin_update` policy and table grant expose direct profile updates to authenticated administrators.

## Goals / Non-Goals

**Goals:**

- Use one explicit edit-capability decision across document controls and the central mutation boundary; protect direct New/Import paths separately.
- Make server authorization the source of truth for role management and stored document writes.
- Preserve the current invitation approval and password flows, and keep UI state in sync with externally changed profile roles.
- Route authenticated inactive users through a distinct, mail-free reactivation request/review flow with atomic request/profile transitions.

**Non-Goals:**

- Connect the local document editor to the Supabase repository, add a document library, or persist the Estado label.
- Assign the legacy `reviewer` role or define a reviewer workflow. Treat an existing reviewer as read-only until a later migration explicitly resolves that role.
- Add a new authentication provider.

## Decisions

### 1. Administrative user-management surface

Add a `Usuarios y roles` entry alongside `Solicitudes de acceso` in the existing account menu. An admin-only dialog lists profiles and offers `admin`, `editor`, or `reader` plus active/inactive status for other users. Display a legacy reviewer as read-only in the selector or as `Sólo lectura (rol anterior)`; never offer `reviewer` as a target value. Disable self-demotion/self-deactivation in the UI and explain why, but rely on the server for rejection. The requests dialog handles both first-access and reactivation requests, visibly labelled by kind; user management can also reactivate an account directly. Keep these two surfaces separate because the queue describes a request lifecycle, while the user list describes existing profiles. A direct admin reactivation resolves any pending reactivation request as `reactivated` in the same transaction, avoiding an obsolete queue entry. Alternative: force every reactivation through the queue; rejected because direct admin reactivation is an existing intended capability.

### 2. Privileged role/status mutation, not direct table updates

Add a `manage-user-access` Edge Function using the existing origin allowlist and JWT verification pattern in `review-access-request`. Require an active admin profile on every request; validate target UUID and a strict action/value allowlist; return explicit 400/401/403/409 errors without leaking service credentials. Have it call a service-role-only transactional RPC to update `profiles.role` or `is_active`. The RPC checks actor and target, forbids self-demotion/deactivation, and serializes changes that could remove an active admin (for example with a transaction-scoped advisory lock) before checking the remaining count. On direct activation, that RPC also closes a matching pending reactivation request atomically. A database guard/trigger should protect the last-active-admin invariant even if another service-role operation writes profiles. Remove the broad authenticated UPDATE grant and `profiles_admin_update` policy so authenticated API clients cannot bypass the Edge Function; retain authorized SELECT for admin listing and self-profile loading. This is preferable to a browser-side `profiles.update`, whose validation and last-admin check could be bypassed or race.

### 3. Central read-only capability with explicit UI affordances

Derive `canEditDocument` from an active `admin`/`editor` profile (demo account remains an editor). Gate `mutate` as the final local safeguard and gate `createNew` and `handleImport` before any state replacement. Pass the same capability to reusable editable fields/tables so text inputs are `readOnly`, selects and checkboxes are disabled, and structural buttons (add, remove, move, rename, toggle) are hidden or disabled consistently. Keep section navigation, copy/select, appearance, and exports available. Show `Sólo lectura` in Estado for reader/reviewer, `En edición` for admin/editor. This is a view/access indicator, not a database document lifecycle state. Alternative: guard every setter independently; rejected because the number of edit paths makes omissions likely.

### 4. Role checks in existing document authorization

Create a forward migration that makes `can_edit_document` and `can_manage_document` require an active `admin` or `editor` in addition to existing ownership/grant conditions. Keep `can_read_document` unchanged and retain the existing create policy, which already requires admin/editor. Since document permissions use `can_manage_document`, readers are denied permission writes as well. Test calls made directly to PostgREST, including owner and preexisting edit-grant cases. Do not rewrite the initial migration. Alternative: rely on the React guard; rejected because API calls would remain writable.

### 5. Profile freshness

After an admin mutation, refresh the displayed user list. The affected user's `AuthContext` rechecks their profile when the app gains focus/visibility and after auth events; during a refresh or failure, avoid exposing editable controls until a valid active role is confirmed. RLS/privileged APIs use the live database role immediately, even before the UI refreshes. A push channel is unnecessary for this initial scope; a user may see a stale role until focus/refresh, but cannot persist an unauthorized write.

### 6. Distinct, authenticated reactivation request

Add a forward migration to mark `access_requests` with a request kind (`registration` for existing rows by default, `reactivation` for this flow) and a terminal `reactivated` status. Keep the unique email row rather than introducing a second queue. Add a `request-reactivation` Edge Function that verifies the bearer token with Auth and derives the user ID and email from the verified account, not request-body input. It requires a matching existing inactive profile; missing/error profiles fail closed. A service-role-only transactional RPC locks the matching request, converts an existing terminal row to `pending` (or inserts a new row), sets kind and `auth_user_id`, clears prior review/error/processing fields, and keeps the profile inactive. If the row is already pending for this user, do no UPDATE at all: preserve `requested_at`/`updated_at` and do not spend another rate-limit attempt. A currently processing request also cannot be reopened by a duplicate submission. Apply rate limiting only to actual new/reopened transitions, inside the serialized operation, so simultaneous duplicates cannot consume extra attempts. No email is sent. Alternative: reuse anonymous `request-access` by email; rejected because it cannot prove the account owner, cannot reopen terminal rows, and would retain misleading invitation messaging.

### 7. Review branches by request kind

Extend `review-access-request` and its service-role-only claim/completion RPCs to branch on request kind. For a reactivation, verify `auth_user_id`, request email, Auth identity, and inactive profile still agree. Approval atomically sets `profiles.is_active=true` and request status `reactivated`; it never calls invitation, password reset, or account creation APIs. Rejection sets `rejected` while leaving the profile inactive. The existing first-access branch retains its invite/recovery behavior. Claim and completion remain single-winner under concurrent review. The pending-access screen calls `request-reactivation` only when the authenticated profile is known inactive; it offers reactivation-specific wording and a stable success message even for an already pending request. Profile-load errors show refresh/sign-out, not a request button. The admin queue labels the two request kinds and their outcomes.

## Risks / Trade-offs

- **Local-only editor:** A read-only role can be enforced in the UI, but document changes in this version are not persisted to Supabase; server RLS protects the existing repository/API for later use, not a currently wired save action. Document this boundary in acceptance testing.
- **Existing sessions can display stale controls briefly:** Refresh on focus/auth events and fail closed while profile state is unresolved; server checks deny writes immediately.
- **Concurrent admin changes:** A simple `count(*)` check can race. Serialize administrative profile changes in the RPC and also guard the invariant in the database.
- **Service key exposure:** Keep service-role credentials exclusively in the Edge Function environment; never include them in Vite variables or responses.
- **RLS regression:** Verify admin/editor reads and writes, reader reads, permission management, and preexisting owner/edit-grant cases using role-specific API tests after migration.
- **Duplicate/race conditions:** A pre-read before an upsert or rate-limit call can still race. Lock or atomically upsert/claim the email row and charge only a successful state transition; test simultaneous submissions and approvals.
- **Identity or stale-request mismatch:** A terminal row may reference an older account. On reactivation, derive identity from the verified token and replace stale `auth_user_id` only after matching its normalized email and inactive profile; review must recheck that identity before activation.
- **Misleading mail/status semantics:** Backfill old rows as registration, use `reactivated` rather than `invited` for mail-free completion, and keep first-access mail behavior untouched.

## Migration Plan

1. Add forward Supabase migrations for role-aware document helpers, the profile-write restriction, transactional admin mutation/last-admin guard, and request-kind/reactivation status plus atomic request/review RPCs. Preserve old access-request rows as registration.
2. Deploy the migration before the Edge Function and UI so direct profile writes are closed first. Verify at least one active admin exists before deploying the admin-management UI.
3. Deploy `manage-user-access`, `request-reactivation`, and the extended `review-access-request`; exercise admin, non-admin, self-change, last-admin, duplicate request, and first-access versus reactivation review paths.
4. Deploy the frontend role-aware controls, admin dialog, and reactivation-specific pending screen; test active sessions for reader/editor/admin and legacy reviewer, then a deactivated account requesting reactivation.
5. If rollback is needed, remove the new UI and Edge Functions first. Reopening direct profile UPDATE is not a safe rollback; retain the restrictive migration and apply a compensating migration only after reviewing the authorization impact. The added enum value cannot simply be removed without handling rows already marked `reactivated`.
