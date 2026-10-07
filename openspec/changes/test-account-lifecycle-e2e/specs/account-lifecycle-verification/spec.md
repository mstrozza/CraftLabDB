# Spec Delta

## Purpose

Provides repeatable evidence that a user can request and receive managed access, establish and use a password, and recover that access without relying on production email delivery during routine testing.

## ADDED Requirements

### Requirement: Deterministic account-lifecycle verification
The verification suite SHALL exercise the public request, administrator approval, invitation return, initial password setup, and later email/password sign-in as one reproducible journey without contacting a live authentication project.

#### Scenario: Approved first access
- **WHEN** a new test account requests access and an administrator approves it
- **THEN** the suite verifies that the request is reviewed, the invitation's setup return opens the password form, and the account can sign in with the password it established

#### Scenario: Authentication is not granted before approval
- **WHEN** a request is recorded but remains pending
- **THEN** the suite verifies that the account has not gained application access and no invitation has been issued

### Requirement: Review outcomes are verified without duplicate invitations
The suite SHALL verify approval, rejection, and repeated review as distinct outcomes and MUST detect an unexpected second invitation for the same completed approval.

#### Scenario: Rejected request
- **WHEN** an administrator rejects a pending request
- **THEN** the suite verifies that no invitation or active account results

#### Scenario: Approval is repeated
- **WHEN** approval of an already completed request is attempted again
- **THEN** the suite verifies that the second attempt does not issue another invitation or create another account

### Requirement: Password recovery proves replacement
The suite SHALL verify that recovery opens the reset form and that a completed reset replaces the previous password.

#### Scenario: Password is reset
- **WHEN** an approved account follows a recovery link and establishes a new password
- **THEN** the suite verifies that the old password fails and the new password succeeds at sign-in

### Requirement: Routine verification is isolated and email-free
The default suite MUST use isolated test identities and state, MUST leave no persistent test account behind, and MUST NOT send real email or invoke a live authentication service.

#### Scenario: Default test run
- **WHEN** the default account-lifecycle suite runs locally or in CI
- **THEN** it uses simulated invitation and recovery links, starts from a known state, and restores or discards all state it created

### Requirement: Live integration check requires explicit staging authorization
An optional live smoke test SHALL run only after explicit opt-in and validation of a non-production Supabase project, a capturable test mailbox, and required secrets. It MUST NOT use production or the default free SMTP service.

#### Scenario: Required staging configuration is absent
- **WHEN** the live test is invoked without opt-in, an approved staging target, or a capturable mailbox
- **THEN** it exits before creating accounts or sending email

#### Scenario: Staging lifecycle succeeds
- **WHEN** the live test is explicitly enabled with valid staging configuration
- **THEN** it verifies delivery and use of setup and recovery links, the old/new password assertions, and removes only resources it created

### Requirement: Failures provide actionable evidence safely
The suite SHALL identify the failing lifecycle stage and relevant request or response outcome without exposing passwords, session tokens, invitation links, or secret keys in its reports.

#### Scenario: Approval or delivery fails
- **WHEN** a lifecycle stage fails
- **THEN** the report identifies that stage and its safe diagnostic evidence, while masking credentials and one-time links
