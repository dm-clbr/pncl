# Missing onboarding account links

A completed onboarding record can have an existing Hub Auth account while
`onboarding_records.supabase_user_id` remains empty. Hub shared sign-in rejects
that identity before requesting a LeadSpply or Pay link. Matching email addresses
alone are not sufficient authority to attach an existing account.

Portal provisioning previously returned its Auth ID only after welcome email
delivery succeeded; callers persisted the link afterwards. A delivery or later
database failure could leave an existing account unlinked. The new path saves a
validated link before sending mail, and failure handling reloads persisted IDs
instead of restoring stale null values. Account creation and database linking
cannot share a transaction, so an interruption between them remains recoverable
through server-owned onboarding provenance on a retry.

## Administrator repair

The onboarding holds page also searches older, unreleased records with missing
links. **Connect existing account** appears only when the server verifies:

- The original onboarding completion and finalized application/contract remain
  present; Google is ready and no provisioning attempt is active.
- Exactly one eligible existing Auth account matches the work email, and its
  verified, immutable Google subject matches the recorded Workspace identity.
- No conflicting enrollment, account binding, server-owned onboarding metadata,
  release, disabled account, pending email change, or other setup failure exists.

The endpoint requires a current full administrator. A service-only database
transaction rechecks these conditions, locks the existing records, changes only
the binding and related portal/finalization status fields, and writes an audit
entry. Original completion and all unrelated onboarding values are preserved.
It does not create accounts, change roles, send mail, alter payroll, or issue SSO
links. Repeating a successful repair creates no additional audit entry.

Incomplete onboarding must follow its normal completion flow. Missing or
ambiguous identities require manual investigation. A repaired Hub link does not
establish LeadSpply ownership, approval, or Pay account provisioning; their
existing guards still apply.

## Rollout order

1. Review the target migration history and apply only the intended migration,
   `supabase/migrations/20261112011710_portal_account_link_reconciliation.sql`.
   Do not deploy dependent functions before it. The four RPCs are executable only
   by `service_role`, use a fixed search path, and inspect current Auth state.
2. Deploy the provisioning consumers `submit-onboarding`,
   `retry-onboarding-enrollment`, `admin-retry-onboarding`, `admin-create-user`,
   `setup-portal-account`, and `admin-resend-activation`.
3. Deploy `admin-reconcile-onboarding-link` and `admin-list-onboarding-holds`.
   Deploy `portal-leadspply-setup`, `portal-leadspply-sso`, and
   `manage-leadspply-integration` for the specific missing-link message and safe
   eligibility-failure logging. Preserve existing JWT and endpoint settings.
4. Publish the frontend after the endpoint is available. Review the queue using
   the administrator's own session. Verify repaired state and the audit entry;
   let the account owner perform their own normal sign-in.

The migration is additive. Rolling back application code can leave these RPCs
installed; rolling back code does not undo a deliberate audited data repair.
No bulk completion or email-only backfill is included.

## Validation

`python3 scripts/test-portal-account-links.py` creates a temporary PostgreSQL 17
container with no network or published ports and no production credentials. It
checks repair, denial cases, unchanged completion/roles, execute grants, audit
rollback, and concurrent idempotency. Docker and the `postgres:17.6` image are
required; the container is removed on exit.

`npx vitest run src/test/portal-account-link.test.ts src/test/portal-link-repair.test.ts src/test/enrollment-profile-finalization.test.ts src/test/hub-setup-security.test.ts src/test/shared-signin-setup.test.tsx src/test/enrollment-state.test.ts`
checks mail failure/retry, durable identity preservation, the admin boundary,
older-record detection, user messaging, and the existing Hub/LeadSpply/Pay guards.
