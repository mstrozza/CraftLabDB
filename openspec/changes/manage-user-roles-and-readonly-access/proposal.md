# Proposal

## Why

The app already authenticates users and stores a role in Supabase, but administrators cannot manage that role in the app and a `reader` can still edit the local document UI. Role changes also need server-side enforcement so a restricted user cannot bypass the interface through the API.

## What Changes

- Give active administrators a user-management view to list accounts and assign `admin`, `editor`, or `reader` to other users. The existing `reviewer` role remains a legacy database value and is not assignable.
- Let an authenticated but inactive account explicitly request reactivation. Reopen a prior terminal access request as pending without activating the account or sending mail; show it to administrators as a reactivation rather than a new registration.
- Let administrators approve a reactivation by enabling the existing profile without creating/inviting a user or requiring email, or reject it without changing access. Repeated pending requests remain idempotent.
- Prevent administrators from demoting or deactivating themselves and prevent removal of the last active administrator.
- Make document editing capabilities depend on the authenticated user's role: readers can navigate, select/copy, and export, but cannot create a new document, import, or mutate any document content or structure.
- Show `En edición` for editable sessions and `Sólo lectura` for readers in Información del documento > Estado.
- Enforce the role policy in Supabase as well as the frontend, including document/permission RLS and a privileged, validated route for administrative role changes.
- Preserve Google sign-in and the invitation/password-recovery flows for first access; reactivation does not use those mail flows. Do not add document persistence or a document library in this change.

## Capabilities

### New Capabilities

- `user-role-management`: Administrative listing, safe assignment of user roles/active status, and review of authenticated reactivation requests.
- `document-role-access`: Role-dependent editing, read-only presentation, and server-side document write authorization.

### Modified Capabilities

None; the project has no existing main specs.

## Impact

The change affects the authentication context and pending-access gate, administrator request review, the app's document controls and status display, Supabase access-request state and privileged functions, profile policies, document authorization helpers and RLS, and tests of both UI and API authorization. Existing local-only document editing remains local-only.
