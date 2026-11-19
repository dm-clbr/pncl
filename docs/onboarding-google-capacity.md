# Google Workspace capacity recovery

New enrollment failures caused by Google's user cap, a license limit, or a mailbox that is not activated enter `waiting_google_capacity`. The application, signed agreement, temporary password, and any existing account IDs remain saved. The applicant sees a waiting screen and may close the browser.

The database schedules `onboarding-capacity-worker` every minute. Each waiting enrollment is eligible again five minutes after its last attempt, with bounded batches. A global lease and per-enrollment locks prevent concurrent retries. Recovery reuses existing Google/Hub accounts. Ordinary permission, identity, or suspension errors require admin attention; provider outages during an existing capacity wait remain queued. Released enrollments and historical failed attempts are excluded.

The admin must provide capacity, assign an appropriate Gmail license (including to Sales Reps), or activate Gmail. The worker does not purchase licenses or change subscription settings. Once Google reports a usable mailbox, setup continues automatically. A durable notification outbox alerts the admin when waiting starts, when setup becomes ready (with a private resume link), or when another failure requires attention. Delivery errors are retried. Resend idempotency keys suppress duplicate sends.

Notification recipients use `PNCL_GOOGLE_CAPACITY_NOTIFY_EMAILS`, then `PNCL_GOOGLE_FIRST_SIGNIN_NOTIFY_EMAILS`, then `GOOGLE_WORKSPACE_ADMIN_EMAIL`. The worker validates the recipient configuration and Resend key at startup. Monitor `onboarding_capacity_worker_state.last_error` and unsent rows in `onboarding_capacity_notifications`.

The worker is initially disabled by the migration. Enable `onboarding_capacity_worker_state.enabled` after deploying the new worker and affected onboarding functions. Set it to false to pause automatic recovery. `select public.onboarding_capacity_dispatch(true)` performs an empty-queue health check without creating an account or sending a test email. Cron uses short-lived, one-use wake tokens; public clients have no access to queue tables or worker RPCs.

Matching expired resume links can show only the non-sensitive waiting status. Credentials still require an unexpired link. After recovery, the admin receives a usable link and can copy a fresh one later. Existing valid links are reused rather than invalidated on each copy.

Tests cover Google capacity classification, license activation, transient outages, account reuse, saved contracts/passwords, long browser waits and recovery, notification retries, resume-link security, row locks, token replay/expiry, and released enrollment exclusion. Run `supabase/tests/onboarding_google_capacity.sql` only against an isolated test database; it creates a minimal schema and mocks outbound HTTP.
