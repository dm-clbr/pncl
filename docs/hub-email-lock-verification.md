# Hub work-email restriction

Deployed and verified October 27, 2026 on Hub project `dpnajpojbxgsckwrmvnm`.

## What is enforced

- `auth.users` rejects user-initiated work/login email changes, new pending changes and completion of pending changes without an approved rename. Ordinary profile updates and token clearing still work.
- `auth.identities` rejects changed identity email and reassigned identity ownership. Matching-email provider metadata refreshes remain allowed.
- The full-admin endpoint checks the caller's live Auth user, then uses that user's JWT for a second database authorization check. User metadata, caller-supplied actor IDs and service-role bypasses cannot grant rename permission.
- A one-use, 60-second permit names the target UUID and exact old/new email. The database rechecks the administrator's current role, confirmation, domain, deletion and ban status. Permit creation locks the target row and enforces a one-minute cooldown.
- The destination must use the exact `thepncl.com` domain and must not belong to another Auth user, identity or active onboarding reservation. A conflicting/stale onboarding record requires review.
- A successful rename updates Auth and the matching onboarding work email in one transaction, consumes the permit and writes a private audit. It preserves the user's UUID. Private tables have RLS and no browser/service-role table grants.

## Deployment and results

Only these migrations and the named endpoint were deployed; the separate LeadSpply migration feature remains local and disabled:

- `20261027165650_hub_work_email_lock.sql`
- `20261027170056_hub_email_onboarding_id_type.sql` — matches Hub's existing text `onboarding_records.supabase_user_id` column to Auth UUIDs. The initial local fixture used UUID; the corrected fixture now reproduces the live column type.
- `admin-update-user-email` version 5, active, JWT verification enabled.

Validation passed:

| Coverage | Result |
| --- | --- |
| Focused application tests | 34 passed across email-change helper, trusted work-email lookup and existing LeadSpply controls/proxy tests |
| Isolated GoTrue v2.197.0 with Postgres and SMTP sink | 32 API/database checks passed |
| Hosted Hub synthetic accounts | 22 checks passed; all test accounts deleted |
| Application TypeScript | `tsc --noEmit -p tsconfig.app.json` passed |
| Hosted permissions/cleanup | Both guards enabled; anonymous RPC denied; browser private-table reads denied; no pending changes, test users or permits remain |
| Supabase advisories | No new security or performance findings compared with pre-deployment snapshots |

The isolated tests use actual authenticated email-change requests and distinct confirmation tokens from a real pending change created before the guard. They also verify expired permits, admin-role revocation, stale-onboarding rollback (including the preceding Auth identity update), duplicate/domain checks, provider identity changes, ordinary metadata updates and hard account deletion.

Hosted checks use confirmed synthetic accounts and generated login links without mail delivery. They cover anonymous/agent denial, forged user metadata, permit-RPC denial, direct Auth Admin bypass, no-send email-change-link generation, approved rename, unchanged UUID, retry/idempotence, cooldown and consumed-permit rejection. One synthetic rename audit is retained. Existing users and Google Workspace accounts were untouched.

## Reproduce the isolated test

With Docker running and Python 3 installed, from the Hub repository:

```sh
python3 scripts/run-hub-email-lock-tests.py
```

The runner creates random local-only credentials, an internal Docker network with no published ports, a disposable Postgres database, GoTrue and Mailpit. It applies both migrations, runs `scripts/test-hub-email-lock-api.py`, and removes its containers, volumes and temporary secrets. It never loads production credentials or the PNCL Pay RSA private key.

## Limits and operations

- Direct Auth `/user` email requests may send a confirmation email before the database rejects the change. The rejection prevents a pending/change commit, so that link cannot rename the account. This path was tested only with the isolated mail sink; no external confirmation mail was sent during verification. Do not claim the lock suppresses all mail attempts.
- The raw Auth API exposes a generic database error for the restriction. Hub's endpoint uses safe errors: 400 invalid input/domain, 401 invalid session, 403 insufficient role, 409 duplicate/stale/review-required state, 429 cooldown, and 502 an unconfirmed server failure. Refresh after an uncertain response; do not blindly repeat a rename.
- Live Google/Workspace sign-in after a coordinated rename and full Hub-to-Pay login still need end-to-end testing. The identity guard deliberately rejects an unexpected provider email change. Coordinate Workspace, Hub, LeadSpply and Pay matching before enabling the affected identity; never reuse an email to impersonate another account.
- Pending email changes block an admin rename and require investigation. Resolve any stale onboarding record rather than weakening the guard. If a rename fails, the Auth transaction rolls back its identity, onboarding and audit writes; unused permits are cancelled or expire within 60 seconds.
- For an incident, stop approved renames and keep the database guards enabled while investigating. Reverting only the endpoint to its old version will cause admin renames to fail closed. Removing the guards reopens direct API changes and requires a separately reviewed migration; keep Pay SSO disabled for affected identities until reconciled.

Source behavior checked against [Supabase's user update implementation](https://github.com/supabase/auth/blob/master/internal/api/user.go), [Auth Admin update implementation](https://github.com/supabase/auth/blob/master/internal/api/admin.go), and [generate-link API documentation](https://supabase.com/docs/reference/javascript/auth-admin-generatelink).
