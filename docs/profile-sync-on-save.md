# PNCL profile sync after a save

Hub loads connected profile values once when the profile component mounts. Time passing, focus changes, and tab visibility changes do not request another read or start delivery. An explicit “Try loading again” action can repeat a failed display read. Draft edits stay local until **Save profile**.

Committed profile writes request delivery through the database outbox. This includes the native profile fields and photo persisted by Save profile, and explicit saves in licensing/document flows. The API does not start a second worker alongside the signed database wake-up. Reading a profile, a legacy tick, or a reverse flush cannot request new PNCL delivery work.

The former once-per-minute `profile_sync_private.kick()` cron job is disabled. `kick(NULL)` is also inert, and the legacy `tick_users` RPC returns an empty list. No scheduled profile scan or idle retry job remains on PNCL.

Only accounts with `sync_requested = true` can claim a delivery lease. Workers keep the production limits of four concurrent accounts and four fields per batch. Saved work that arrives at capacity is made eligible for a finishing worker; a rejected claim rechecks capacity to cover a concurrent completion. Continuations use `wake()`, which does not reset failed events. Identity checks, idempotent operations, file ownership checks, and latest-save ordering remain in place.

Failed delivery events remain in the outbox as errors. They are retried by the next explicit profile save (or the existing explicit retry API used by older clients), without a recurring timer. A lost wake-up or crashed worker is likewise recovered by a later save once any existing lease expires. Existing pending events are retained; the migration does not automatically send an old backlog. A page reload displays the latest connected values and delivery status.

The sync timer previously also invoked old mirror-file garbage collection. Disabling it stops that automatic cleanup; this change does not delete any files. The existing maintenance RPC remains available for deliberate maintenance.

This deployment changes **PNCL Hub**. LeadSpply's existing deployed reads are already read-only and do not reverse-flush PNCL. Its deployment and scheduler are not changed here. The shared handler keeps the LeadSpply behavior separate from the new PNCL `ready_users` RPC.

## Deployment and verification

1. Apply `20261104190150_profile_sync_on_save.sql` to PNCL. It includes the lease/trigger protections already present in production so a fresh checkout has the same behavior. No data reset or deletion is involved.
2. Deploy PNCL's `profile-sync` Edge Function with the shared dependencies, preserving `verify_jwt = false` because the handler authenticates both user sessions and signed database wake-ups.
3. Deploy the frontend. Confirm the cron job is inactive, `tick_users` returns `[]`, and the saved-event RPCs and deployed function exist.

Automated coverage includes fake-timer browser component tests (one hour idle without another request), save failure/idempotent retry, handler tests for reads/ticks/saves/lease completion, and an isolated PostgreSQL test of committed wake-ups, failed events, four-account capacity, fifth-save handoff, and service-role-only privileges. Run the SQL checks using `PSQL=/opt/homebrew/bin/psql python3 scripts/test-profile-sync-on-save.py` with a disposable local PostgreSQL server on port 55447.

Rollback requires the pre-change function definitions and Edge Function snapshot in `output/profile-save-only/before.json`. Restore both together before re-enabling the old cron job. Do not deploy the older repository worker over production without reconciling its lease support.
