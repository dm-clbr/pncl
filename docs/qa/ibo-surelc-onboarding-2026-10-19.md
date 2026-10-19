# IBO SureLC onboarding validation — October 19, 2026

## Requirements checked

Sources: [Brandon's October 18 email](https://mail.google.com/mail/u/2/#inbox/FMfcgzQhWxWTbtBGWpfBXLhHdqHmHBrR), [Jordan's September 8 instructions](https://mail.google.com/mail/u/2/#search/IBO+SureLC/FMfcgzQhWLQChPcmxSrBcHpsBdNjqRJC), [IBO changes](https://docs.google.com/spreadsheets/d/1E1Fd-lLz02LLLK0LuUOcIQ9efpLBFHidZNNoYi81IUk/edit), and [worklist rows 5–7 and 10](https://docs.google.com/spreadsheets/d/1OVegxkUbHBtR5jIZ4lZzJZUZSh3qrjOS0oJKcceFDJY/edit#gid=536836210&range=A5:H10).

| Requirement | Result |
| --- | --- |
| IBO designation survives invite and enrollment; legacy links default to LOA | Existing referral and enrollment regression tests pass |
| IBO omits W-9, direct deposit, and comp agreement | Full inventory tests pass; LOA retains these requirements |
| Separate IBO walkthrough, after E&O and before SureLC accounts | Correct video and ordering; LOA completion does not satisfy IBO playback |
| Require playback before SureLC actions | Checklist and profile links enforce the tutorial gate; playback/seek tests pass |
| Correct carrier assignments | Mutual of Omaha and Transamerica are in #3, absent from #1; saved and directory-derived instructions agree |
| Warn before opening each SureLC account | Dialog uses Jordan's wording and the specific account's carrier list, including on repeat visits |
| Ethos/UHL are automatic | Explicit PNCL-email instructions; unassigned directory carriers are not presented as SureLC requirements |
| Mandatory New Producer submission | Last Licensing step, after every prerequisite; no approved contracts or writing numbers required |
| Create New Producer support ticket | Server validates the applicable onboarding path; one durable ticket resolves completion |
| Replace premature contracting email | Profile saves no longer alert contracting; legacy endpoint authenticates and returns a retired-action response |
| Preserve prior completed submissions | A protected rollout snapshot preserves historical completion, including older submissions whose optional notification failed |

Stage placement follows Brandon's explicit September 21 instruction to put New Producer last in Licensing. The October 6 checklist still labels it Stage 4; the prior implemented stage consolidation is preserved.

## Verification

- 568 Vitest tests pass, including complete 29-step IBO and 32-step LOA progression, referral designation, enrollment, training, playback, and submission failure tests.
- Frontend TypeScript check, changed frontend ESLint checks, and production build pass.
- Deno checks pass for `notify-new-producer`, `notify-licensing-complete`, and `list-portal-todos` and their imports.
- The migration was applied to an isolated UTF-8 PostgreSQL database seeded with the production step inventory. Tests verify carrier copy, permissions, failure rollback, unique tickets, and preservation of unrelated data.
- Eight concurrent service-role submissions returned one ticket ID and persisted exactly one ticket. The service role did not have access to `auth.users`.
- Browser checks use the actual checklist and dialogs with clearly labeled test data. Verified initial IBO exclusions, locked stages, video/PDF rendering, account warnings, required submission acknowledgment, and transition to Sales Ready.
- The prior notification-only response is rejected by the new client. Ticket-save failures remain incomplete; optional email failure does not erase a saved request.
- Live compatibility verification found 13 older completed submissions without notification timestamps. The follow-up migration records all 82 historical completions in a read-only table, creating no tickets or notifications. Subsequent user-metadata edits cannot create historical completion records.

## Test boundaries and existing findings

The full portal journey is covered with synthetic completion sources and isolated database records. This does not claim a new production Google mailbox, live OAuth enrollment, real identity-document upload, legally binding signature, or carrier application was created. No test emails were sent. The preview's scenario controls are local and are not included in the production build.

A broader Deno check of all transitively related endpoints found four existing errors outside the changed submission flow: `recoveryEmail` in enrollment provisioning, a missing dedup candidate ID, optional email handling in admin deletion, and the admin profile's `unknown` Workspace status. These are not introduced by this change.

The pre-change Supabase security scan reported existing advisories: missing RLS on `onboarding_contract_signatures` ([remediation](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public)); mutable search path on `set_updated_at` ([remediation](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)); public execution grants on `track_portal_profile_comp_level` ([anonymous](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)); disabled [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); and [RLS-without-policy informational notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) for service-only tables. The new ticket RPC is security-invoker with a fixed search path and service-role-only execution; it does not expand client table permissions.

## Reproduction

```sh
NODE_OPTIONS=--no-experimental-webstorage npm test
npx tsc --noEmit -p tsconfig.app.json
npm run build
deno check supabase/functions/notify-new-producer/index.ts supabase/functions/notify-licensing-complete/index.ts supabase/functions/list-portal-todos/index.ts
# Only against a disposable database with the migration and test schemas installed:
psql "$PNCL_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/ibo_onboarding.sql
```
