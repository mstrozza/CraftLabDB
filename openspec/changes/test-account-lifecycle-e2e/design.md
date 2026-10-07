# Design

## Context

The app uses Vite/React and Supabase JS. `AuthContext.jsx` owns login, access request, review, setup, and recovery; `AuthGate.jsx` renders the corresponding screens. The request function records a pending request without sending mail, while approval invokes Supabase Auth to invite a new user and activate the profile. There is no test runner in `package.json`; Docker and Supabase CLI are unavailable in the current environment. See `proposal.md` for the motivation and `specs/account-lifecycle-verification/spec.md` for the observable contract.

## Goals / Non-Goals

**Goals:**
- Provide a repeatable browser-level journey for every account stage with no dependency on a hosted project or email quota.
- Keep a separate, explicitly enabled smoke check for real Supabase Auth and email delivery in staging.
- Make test data, cleanup, and failure evidence safe and predictable.

**Non-Goals:**
- Change the production authentication flow or its API contract.
- Run a local Supabase stack, test production accounts, or use the project's default free SMTP for automation.
- Treat mocked browser checks as proof that hosted Supabase, database policies, or mail delivery work.

## Decisions

### 1. Playwright browser suite with a test-only Supabase contract harness

Add Playwright as a development dependency and run the Vite app with a dedicated test environment pointing at an inert Supabase origin and public test key. Playwright intercepts the Supabase JS HTTP boundary (Auth, Functions, and required profile/request reads) and maintains a small in-memory account/request state machine shared by the browser contexts for applicant and administrator. It supplies simulated setup and recovery redirects, including the session state that Supabase JS expects. This exercises the real UI and `AuthContext` wiring without changing production code or sending email. A fail-closed route catches unexpected Supabase calls so the harness cannot silently reach the live project. This is preferred to component-only tests because redirects, browser storage, and role-gated screens are central to the journey; it is preferred to live-only tests because of quota and nondeterminism.

The harness models only the contract needed by the journey: pending request, one-time approval/rejection, invitation issuance count, active profile, password setup/login, recovery, and password replacement. Assertions count outgoing requests and verify visible states; they do not claim to validate SQL/RLS behavior.

### 2. Per-test isolation and bounded cleanup

Each deterministic test starts with fresh harness state and isolated Playwright browser contexts/storage. Its teardown closes contexts and discards state; no external account is created. The optional live test uses a uniquely named test mailbox identity and records exact created request/user IDs. Cleanup targets only those IDs in the designated staging project and never truncates tables or deletes unrelated accounts. If cleanup fails, the run reports those exact resources for manual review rather than broadening deletion. A project reference allowlist and test-identity marker are checked before any live write.

### 3. Separate opt-in live staging smoke test

A separate Playwright project/command performs one real lifecycle against a dedicated Supabase staging project configured with a capturable SMTP provider or test mailbox API. It requires an explicit enable flag, the approved staging project reference, browser-safe URL/public key, a dedicated admin test account, mailbox access, and a server-side secret for narrow fixture cleanup where needed. Secrets come only from runner environment variables, never `VITE_` variables or committed files. The smoke test reads the invitation and recovery links from the test mailbox, follows them in a browser, checks setup/login/reset including old-password failure and new-password success, then removes only its own fixtures. No default CI job invokes this project. This is preferred to using the free Supabase mailer, whose quota and recipient restrictions make automation unreliable.

### 4. CI and diagnostic boundary

The default `test:e2e` command and CI run only the deterministic project. Live execution uses a distinct command and an explicit flag; missing or mismatched staging configuration fails before network mutation. Playwright traces/screenshots are retained on failure, while network logs and attachments redact `Authorization`, passwords, one-time links, tokens, and service keys. Reports name the failed stage (request, review, delivery, setup, login, recovery, cleanup) and safe status/error codes. Browser-mock failures indicate app/contract regressions; live-only failures direct investigation to deployed functions, Auth logs, SMTP, redirects, or RLS.

## Risks / Trade-offs

- Mock drift from deployed Supabase behavior -> keep the harness narrow, model observed API contracts, and run the optional staging smoke before releases that change authentication.
- Browser redirect/session handling may differ from real Auth -> explicitly test the expected setup/recovery URL and session handoff, then verify the same path in staging.
- Live tests can send duplicate mail or leave users if interrupted -> run serially with unique identities, record exact IDs, and use bounded best-effort cleanup with visible leftovers.
- Misconfigured credentials could target a real project -> require explicit opt-in plus staging project allowlist and test mailbox marker before writes; never expose privileged keys to Vite or browser code.

## Migration Plan

Introduce the test dependency, harness, deterministic specs, and documentation without altering production auth. Add the deterministic command to CI after it passes locally. Keep the staging command disabled by default and enable it only when the staging project and capturable SMTP are ready. Rollback is removal of test-only files/scripts/dependency; no application data migration is required.
