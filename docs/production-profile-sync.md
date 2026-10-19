# Production profile sync

PNCL and LeadSpply use the saved UUID account link. Their native profile tables remain authoritative for their existing fields. Missing counterparts, field clocks, operation receipts, conflicts, and delivery state live in the service-only `profile_sync_private` schema; no broad profile view or hierarchy grant is expanded.

## Data flow

Native profile/document writes (including user, admin, and onboarding paths) commit an outbox event in the same transaction. A signed database HTTP kick requests delivery after commit; a minute cron retries durably. The scheduler enqueues individual accounts, and each worker handles at most four fields before queuing remaining work, keeping request bursts bounded. Delivery locks the destination profile, compares per-field save order, and commits its native projection and receipt together. A stale event cannot replace a newer value. The latest server-recorded save wins for each changed field, including simultaneous changes and saves from an older form. A deterministic source/event tie-break makes both replicas converge when timestamps match. Initial data never overrides a deliberate edit or clear. Existing conflicts are requeued with their original save order and fresh delivery IDs; historical events and receipts remain intact.

Both existing Save buttons include counterpart drafts. Native user edits preserve unrelated fields. Older clients may still submit expected clocks; these no longer block an intentional save. Native follow-up workflows do not write synced fields a second time. Private files are copied and hashed before references are committed. File uploads use immutable paths; a storage trigger detects replacement by older clients using a fixed path. Removal is a tombstone. Photos retain their existing public visibility; private documents retain private access. New counterpart documents use a service-only bucket and owner-bound, 60-second signed links.

The shared phone value uses E.164, while PNCL projection keeps its existing `555-555-5555` format and database constraint.

NPN projection calls LeadSpply's existing `set_my_npn` validation and audit function under the verified linked owner's transaction identity. License approval and account controls are not mirrored. Legacy licensed states are retained until reconciled with a number. PNCL's Google recovery-email flow is retained. Inbound LeadSpply business updates invoke its existing `sync-business-profile` service workflow for CRM propagation.

## Operations and retention

The dedicated random shared credential is stored only in each private settings row. Browser callers authenticate through Supabase Auth and cannot supply an actor or target. Server calls reject browser Origins and check the durable account pair and account availability. No service credential is shipped to the frontend. Database wake-ups carry a five-minute HMAC signature restricted to starting sync jobs, so the managed HTTP queue never contains the persistent credential.

Ten failed field deliveries become inspectable errors; Retry keeps the event identity. Account unavailability pauses delivery. Unreferenced generated `/mirror/` files older than 30 days are removed by the worker, excluding current/conflict files and pending events. Existing original files retain each app's current retention behavior. Service-only operation/event receipts and conflict history remain until their profile is deleted, preserving idempotency. General audit records contain field and outcome, not profile values.

Rollback: set `profile_sync_private.settings.enabled=false` in both projects, and disable the `production-profile-sync` cron job. Captured events stay durable; existing native profile workflows remain available. Do not drop the private schema or receipts as a rollback.

## Verification

- PNCL complete suite: 575 tests passed for automatic saves and song selection.
- LeadSpply full CI: 5,292 tests passed, one skipped; lint, typecheck, build, database checks, Deno syntax, migration sanity, and secret scan passed. Profile/admin/song UI checks: 11 passed.
- Both production bundles passed. LeadSpply typecheck ratchet stayed at 99/99 existing errors. PNCL application typecheck passed.
- Isolated actual PostgreSQL checks cover both migrations, native capture, normalization, bidirectional projection, automatic concurrent resolution, deliberate saves from stale forms, receipt replay, NPN validation/audit, privacy, retry exhaustion, fixed-path photos, and concurrent sessions. Upgrade tests also cover existing conflicts, receipts accepted before deployment, and exact timestamp ties.
- Twenty-three real handler checks against isolated databases cover auth/CORS, forged actor and file references, field allowlists, derived county, lost responses, private file transport/deletion, document collections/labels, suspension, and signed wake-up forgery, expiry, action scope, and browser-origin rejection, and large backlogs draining across bounded jobs.
- Both hosted migrations passed rollback-only transaction/replay/RLS/grant checks. New advisor findings are informational missing-policy notices on intentionally service-only private tables.

Run the integration scripts against an isolated PostgreSQL server (never production):

```sh
export PNCL_SYNC_REPO=/path/to/PNCL
export LEADSPPLY_SYNC_REPO=/path/to/agent-s-advantage
export PROFILE_SYNC_TEST_PORT=55439
export PROFILE_SYNC_TEST_ROOT=/tmp/profile-sync-test
python3 "$PNCL_SYNC_REPO/scripts/test-production-profile-sync.py"
python3 "$PNCL_SYNC_REPO/scripts/test-production-profile-sync-upgrade.py"
node "$PNCL_SYNC_REPO/scripts/test-production-profile-sync.mjs"
```

The scripts recreate only `mirror_pncl`, `mirror_leadspply`, `mirror_upgrade_pncl`, and `mirror_upgrade_leadspply` on localhost, use synthetic identities and files, and require a local PostgreSQL superuser named `postgres`. Native services and external CRM calls are stubbed in the isolated HTTP harness; hosted smoke checks validate the deployed database separately.

## Release SQL safeguards

Production migrations are additive. They do not drop or truncate native tables, delete profiles, rewrite account links, or expand browser access to private sync state. Dynamic native projection uses the fixed service-owned mapping and quoted identifiers, with values passed as parameters. The account pair must match the existing durable link; source-owned account controls are excluded. Empty counterparts can be filled; concurrent changes converge automatically using server save order. This deliberately allows a newer save to replace an existing value without a review prompt.

Activation changes only the singleton enabled flag and installs the named minute worker. Disable that flag in both projects to stop delivery while retaining queued changes and receipts. The existing HTTP queue belongs to Supabase and retains owner-granted public permissions; wake-ups therefore contain only short-lived HMAC signatures limited to starting sync, never the persistent credential.

## Close out song

`close_out_song` stores only the selected Apple catalog ID, title, artist, and store link in the private shared-field store. It has no native profile column and uses the same save/clear/delivery mechanism on both platforms. Owner-authenticated search calls Apple's public metadata search on demand, with bounded result counts, timeouts, per-instance caching, and rate-limit feedback. Search text is sent to Apple; profile data and credentials are not. Audio preview and artwork URLs are discarded. No audio is downloaded, stored, or played. Playback and clip licensing are deferred by the product owner.

Reference: https://performance-partners.apple.com/search-api
