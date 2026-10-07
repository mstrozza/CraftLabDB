# Tasks

## 1. Playwright setup

- [x] 1.1 Add Playwright, its configuration, deterministic/live scripts, and lockfile changes; verify `pnpm install --frozen-lockfile` and Playwright test listing succeed with Node >=20.19 and pnpm 11.19, without Docker or Supabase CLI.
- [x] 1.2 Configure a test-only Vite environment with an inert Supabase URL and public dummy key; verify the default test command never reads the real project URL or a service-role secret.

## 2. Deterministic Supabase boundary

- [x] 2.1 Build a Playwright contract harness for the Auth, Functions, and profile/request calls used by `AuthContext` and the admin UI; verify an unrecognized Supabase request fails closed instead of reaching the network.
- [x] 2.2 Model pending requests, one-time approval/rejection, invitation/recovery links, account activation, passwords, and invitation counts in per-test state; verify isolated browser contexts and two consecutive runs start clean and produce the same results.
- [x] 2.3 Document the simulated boundary and how to run it locally, including that it does not validate deployed SQL/RLS or email delivery; verify the documented command works without staging credentials.

## 3. Account-lifecycle browser journeys

- [x] 3.1 Test public access request and pending state; verify no authenticated access, Auth user creation, or invitation occurs before approval.
- [x] 3.2 Test administrator approval followed by the simulated `?auth=setup` return, password creation, sign-out, and email/password sign-in; verify the account becomes active and the complete journey passes.
- [x] 3.3 Test rejection and repeated review of a completed approval; verify rejection sends no invitation and repeated approval creates neither a second account nor a second invitation.
- [x] 3.4 Test `?auth=recovery`, reset form, and password replacement; verify the old password fails and the new password succeeds after reset.
- [x] 3.5 Add safe stage-level failure diagnostics for request, review, setup, login, and recovery; verify injected failures identify the stage while reports, traces, and screenshots expose no passwords, tokens, one-time links, or secret keys.

## 4. Optional live staging smoke

- [x] 4.1 Add a separate live-test command with preflight for explicit opt-in, allowlisted non-production project, capturable SMTP/test mailbox, dedicated admin identity, and required environment secrets; verify missing or mismatched values abort before any account creation or mail send.
- [x] 4.2 Exercise request, admin approval, delivered setup link, initial password login, delivered recovery link, and old/new password assertions against staging; verify the smoke test passes only with a captured mailbox and records safe stage/error evidence on failure.
- [x] 4.3 Restrict live cleanup to exact IDs created by the run and a test-identity marker; verify interrupted/failed cleanup reports those IDs for manual review and never truncates tables or deletes unrelated users.
- [x] 4.4 Document staging prerequisites, environment-only secrets, explicit command, SMTP restriction, and narrow cleanup procedure; verify no privileged key is committed or exposed through `VITE_` variables.

## 5. Integration checks

- [x] 5.1 Configure CI to run only the deterministic suite by default and retain sanitized failure evidence; verify the workflow has no live-test command or staging secret requirement.
- [x] 5.2 Run the deterministic E2E suite and `pnpm build`, then validate the OpenSpec change with `openspec validate test-account-lifecycle-e2e --strict` where the CLI has schema-path access; verify both commands pass or record the known schema `EPERM` limitation without altering schema/config files.
