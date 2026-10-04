# Spec Delta

## Purpose

Provides administrators with a safe way to view application accounts and assign effective access roles without permitting privilege escalation or loss of administrative control.

## ADDED Requirements

### Requirement: Administrators can view users and their access
The system SHALL let an active administrator see each application user's identity, role, and active status. Other users MUST NOT see the administrative user list.

#### Scenario: Active administrator opens user management
- **WHEN** an active administrator opens user management
- **THEN** the system displays users with their name, email, role, and active status

#### Scenario: Non-administrator attempts to view users
- **WHEN** a non-administrator requests the administrative user list through the interface or API
- **THEN** the system does not disclose other users' profiles

### Requirement: Administrators can assign supported roles
The system SHALL allow an active administrator to assign `admin`, `editor`, or `reader` to another user and SHALL reject every other requested role. The legacy `reviewer` value MUST NOT be assignable.

#### Scenario: Valid role change
- **WHEN** an active administrator assigns `reader` or `editor` to another user
- **THEN** the saved profile reflects the requested role and subsequent authorization uses it

#### Scenario: Unsupported role change
- **WHEN** a role change requests `reviewer` or an unknown value
- **THEN** the system rejects the request without changing the profile

#### Scenario: Unauthorized role change
- **WHEN** a non-administrator calls the role-management operation directly
- **THEN** the system rejects the request without changing the profile

### Requirement: Administrators can manage another user's active status
The system SHALL allow an active administrator to deactivate or reactivate another user's profile, and inactive users MUST NOT access the editor.

#### Scenario: Deactivate another user
- **WHEN** an active administrator deactivates another user
- **THEN** subsequent authorization denies that user access to the editor

#### Scenario: Reactivate another user
- **WHEN** an active administrator reactivates another user
- **THEN** that user's access resumes according to their assigned role

#### Scenario: Direct reactivation with a pending request
- **WHEN** an administrator directly reactivates a user who has a pending reactivation request
- **THEN** the profile becomes active and the request is resolved as reactivated together, leaving no stale pending item

### Requirement: Inactive authenticated users can request reactivation
The system SHALL let an authenticated user with an existing inactive profile explicitly request reactivation. Submission MUST NOT activate the profile, create another user, or send an email.

#### Scenario: First reactivation request
- **WHEN** an authenticated inactive user submits a reactivation request
- **THEN** the system records a pending request tied to their existing account and keeps their profile inactive

#### Scenario: Reopen a terminal request
- **WHEN** that user submits again after an earlier request ended as invited, rejected, reactivated, or another terminal state
- **THEN** the same account's request becomes pending again and its previous review outcome is cleared

#### Scenario: Duplicate pending request
- **WHEN** the user repeats a request that is already pending
- **THEN** the system returns the same success outcome without changing the request's timestamps or consuming another rate-limit attempt

#### Scenario: Ineligible request
- **WHEN** an unauthenticated user, an active user, or a user without a valid profile invokes reactivation directly
- **THEN** the system does not create or reopen a reactivation request

### Requirement: Administrators review reactivation separately from registration
The system SHALL identify reactivation requests in the administrator queue and SHALL allow an active administrator to approve or reject a pending reactivation request without using the first-access invitation flow.

#### Scenario: Administrator sees request type
- **WHEN** an administrator views pending access requests
- **THEN** each reactivation request is distinguishable from a new registration request

#### Scenario: Approve reactivation
- **WHEN** an administrator approves a pending reactivation request
- **THEN** the existing profile becomes active and the request is resolved as reactivated without creating or inviting a user or requiring an email

#### Scenario: Reject reactivation
- **WHEN** an administrator rejects a pending reactivation request
- **THEN** the request is resolved as rejected and the existing profile remains inactive

#### Scenario: Competing review actions
- **WHEN** two administrators try to resolve the same pending reactivation request
- **THEN** only one resolution succeeds and the account and request remain consistent

### Requirement: Administrative control is preserved
The system MUST reject an administrator's attempt to demote or deactivate their own profile and MUST prevent an update that would leave no active administrator.

#### Scenario: Self-demotion or self-deactivation
- **WHEN** an administrator tries to change their own role away from `admin` or deactivate themselves
- **THEN** the system rejects the change and retains their active administrator profile

#### Scenario: Last active administrator
- **WHEN** an update would leave zero active administrators, including through concurrent requests
- **THEN** the system rejects the update and retains at least one active administrator

