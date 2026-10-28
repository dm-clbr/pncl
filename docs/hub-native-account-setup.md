# Hub account setup and Pay SSO

Implemented October 27; production rollout October 28, 2026. Both server endpoints and LeadSpply guards are deployed, native setup flags are enabled, and hosted verification/frontend rollout are in progress. Pay SSO and endpoint-confirmation flags are explicitly false; the private key is not provisioned. James's public-key reply was sent (`SENT`, message `1a18405e373c6969`, original thread `1a15f3fc818df797`) with the original recipients and only the 625-byte public PEM attachment.

## User flow

PNCL Hub → LeadSpply is the account setup entry point. A current verified `@thepncl.com` Hub Auth email must match a completed, unreleased onboarding record.

1. Existing users enter their current LeadSpply credentials inside Hub. Verified TOTP factors require an authenticator code. The temporary LeadSpply session is signed out locally; its tokens never reach the browser. Unsupported MFA/passwordless recovery goes to support.
2. Ownership verification links the immutable Hub and LeadSpply UUIDs. A conflicting existing link or NPN requires review. It does not change email automatically.
3. The user explicitly selects **Update to my Hub email**. A fresh ownership proof and exact, short-lived server permit authorize the Auth Admin change. Existing account ID, password and data remain. Direct Auth and provider identity updates cannot bypass this process.
4. Users without an account register inside Hub. The server fixes the login email to Hub; the form has no editable login-email field. SMS verification, licensed-agent information/business identity or a setter invite, password validation, and existing registration agreements are retained. Approval is not granted by signup. Separate post-approval calling/texting certification remains in LeadSpply.
5. The Pay button requires a proven account link, matching current Auth emails and account approval. The backend repeats these checks for every launch and rereads Hub Auth/onboarding after the cross-project request. A stale browser view or request-selected email cannot select the SSO identity.

Full LeadSpply tool migration into Hub remains a separate delivery scope. This change implements account setup and the Pay launch gate; it does not claim that all LeadSpply features have moved.

## Implementation

- Hub: `src/pages/PortalLeadSpply.tsx`, `src/components/leadspply/`, `src/lib/hub-account-setup.ts`, `supabase/functions/portal-leadspply-setup/`, shared `pnclSetupContract.ts`, `pnclSetupProxy.ts`, `pnclPay.ts`.
- LeadSpply: isolated checkout `output/leadspply-email-migration`, branch `codex/pncl-email-migration`. New `pncl-hub-setup` endpoint and shared `pnclSetup.ts`; migrations `20261026210535_pncl_verified_work_email_migration.sql` and `20261027175051_pncl_hub_native_setup.sql`.
- The contract is intentionally copied into both Edge projects; keep the copies identical when changing it. Each repository's Vitest suite is self-contained. The isolated integration runner expects the LeadSpply checkout at the documented path.
- Keep the two Supabase projects separate. Hub derives identity and proxies an allowlisted request over TLS with the existing integration secret. LeadSpply rejects browser Origins, checks that secret and independently validates the current pinned Hub export.

## Security and authorization

- No browser-selected Hub/LeadSpply user ID, destination email, role, approval state, source URL or return URL is accepted. User metadata never establishes authorization.
- Registration reservations bind one Hub UUID, one target email and one generated LeadSpply UUID. Retrying can only recover an account with that reserved ID and server-written Hub binding. Private unique reservation indexes also prevent two Hub identities from racing the NPN/phone duplicate checks before Auth creation. Email, NPN and phone collisions require existing-account verification/support; there is no email-only adoption or automatic merge.
- Phone proof is server-held, bound to Hub ID and the exact number, and expires after 10 minutes. Registration state and rate buckets live in private RLS tables without browser or direct service table grants. Service-only wrappers call private functions with a fixed search path.
- A PNCL account cannot self-edit `platform_approved_at` or `setter_status` through the profile API. A new database trigger closes this observed production permission gap when deployed, while preserving existing non-self admin/upline approval paths. Review historical eligibility during roster reconciliation.
- A new account receives only allowlisted metadata. Rep accounts remain pending manual approval; setters retain the existing invite and approval path. Arbitrary staff/admin invitation or hierarchy metadata is rejected.
- Pay uses the current Hub email and immutable Hub UUID as `externalId`. Fresh RS256 JWTs have a 120-second lifetime and unique UUID `jti`, issuer `pnclhub-h7fyl`, and exact audience `https://www.pnclplay.com/api/partner/login-links`.
- Successful links must match the documented HTTPS origin and `/api/auth/partner/redeem` path, contain exactly one token parameter, and be unexpired with a bounded two-minute lifetime. Browser navigation is full-page. The backend never opens or caches the link.
- Runtime signing accepts a server-only PKCS#8 RSA key of at least 2048 bits. The existing dedicated 3072-bit key was not read, regenerated or provisioned during this work. Never place it in source, frontend variables, logs, chat or email. Only the public PEM was attached to James's sent reply.
- Requests and responses use no-store. Error details are allowlisted; passwords, OTPs, keys, JWTs and redemption URLs are never logged. Pay audit events contain only Hub UUID, request UUID, UTC timestamp and outcome.
- A controlled Hub rename may temporarily create mismatches. Pay fails closed until LeadSpply and Pay reconciliation is complete. Recreated Hub accounts get new UUIDs; do not reuse IDs or automatically transfer old links.

## Limits and errors

Shared database limits apply before signing, and a per-Hub transport limit (45/minute) runs before the roster export. Status is limited to 30/minute; credential verification to 6 per Hub/10 minutes and 10 per hashed target email/10 minutes. Phone sends are limited to 3 per hashed number/10 minutes, with additional per-Hub and verification-attempt limits. Other mutations/Pay have per-Hub limits; partner Pay issuance is capped at 50/minute, below James's documented default 60/minute. These are initial conservative limits, not an assertion of James's configured limit.

Rate-limited responses expose a bounded `Retry-After`; Hub disables further attempts during the cooldown. No automatic credential, email-change or Pay retry loop exists. Timeouts after mutations instruct users to refresh status; reservations prevent duplicate registration on retry. Email-change permits expire/cancel precisely.

401 credentials/MFA, 400 form/phone validation, 409 ownership/conflict/approval and 429 limits have safe user messages. Pay 401/configuration and unexpected responses fail closed; 404 requires account setup/support; 422 requires configuration review. Raw provider details are not returned. Any new Pay attempt signs a new JWT.

## Verification

- Hub: **48 focused tests passed** across UI, proxy, signing and email-source/lock suites; production TypeScript and build passed (existing large-bundle warning).
- LeadSpply: **30 focused tests passed**, including native service, email helper, portal HTTP and email notice regressions. Type-error ratchet passed with 58 existing errors against its 99-error baseline; no new file errors. Both new Edge Functions passed Deno type checks.
- `python3 scripts/run-hub-native-setup-tests.py`: **38 checks** against real GoTrue v2.197.0 and Postgres in a disposable internal Docker network with a local SMTP sink. Tests include immutable IDs, direct Auth API and identity guard rejection, one-time permits, old/new login emails, duplicate links/NPN/phone, proof expiry, private permissions, registration retry identity and actual TOTP enrollment/verification. App tables/profile creation are minimal fixtures; this is not a clone of the complete production approval/notification system.
- Twilio and Pay calls are mocked; JWT signatures are verified with ephemeral in-memory test keys. No production RSA private key is loaded into tests. Real partner replay, link redemption, Pay permissions and provider/session switching await the joint test.
- Browser review uses the actual Hub components with synthetic accounts and local service fixtures. It confirms existing-account verification → explicit email update → matching status → disabled Pay pending configuration. Native registration fields and embedded agreements are rendered inside Hub. Preview files/screenshots are in `output/hub-setup-review/`.
- No production users were changed and no external test emails or SMS were sent. Disposable test services and credentials are cleaned up by the runner.

## Rollout and remaining work

1. Apply only the two named LeadSpply migrations, in order, after review. Do not push the repository's entire migration history. Deploy LeadSpply `pncl-hub-setup` and the Hub `portal-leadspply-setup` function. Verify the Hub export includes current `email_verified` and `account_active` fields; deploy its existing local update if needed.
2. Verify the existing shared integration key in both environments and existing Twilio Verify configuration. Keep `PNCL_HUB_SETUP_ENABLED=false` until both sides are deployed; then enable it in both Edge environments and build Hub with `VITE_PNCL_HUB_SETUP_ENABLED=true`. Leave the old transitional `PNCL_EMAIL_MIGRATION_ENABLED` rollout disabled; native setup uses its own gate.
3. Perform controlled hosted smoke tests without triggering live onboarding notifications. A full real signup/SMS delivery test needs a designated consenting test user and notification coordination. Reconcile the intended SSO roster; no bulk account changes are part of this implementation.
4. Public-key reply sent October 28. Await James registering `pnclhub-h7fyl` and confirms the `pnclplay.com` versus `pnclpay.com` hostname discrepancy.
5. Provision the existing private key directly to server secret storage as `PNCL_PAY_PRIVATE_KEY_PEM`, without printing it. Set `PNCL_PAY_ENDPOINT_CONFIRMED=true` only after confirmation. Keep `PNCL_PAY_SSO_ENABLED=false` until partner setup and joint test preparation are complete.
6. Arrange the joint video test with James, Vel, Bill and DM once ready. No email or calendar invitation has been sent. Test correct identity, cross-user denial, changed email, replay/expiry, permission boundaries, logout and account switching before rollout.

Rollback: disable the native frontend/server setup flags to stop new setup mutations; disable Pay issuance separately. Preserve the database email guards and existing links/audit history. For compromised signing material, disable issuance and have James revoke the partner key.

## October 28 deployment record

- LeadSpply email migration: hosted version `20261028194132`. Native setup migration was applied in two equivalent batches after the connector rejected the full request: `20261028195239_pncl_hub_native_setup_state` and `20261028195247_pncl_hub_native_setup_guards`. The local October 27 file contains their combined SQL. Do not push the entire migration history.
- LeadSpply `pncl-hub-setup` v1 is active. Hub `portal-leadspply-setup` and `export-leadspply-reps` are deployed. Setup flags are true in both projects; Hub Pay/endpoint flags and the old transitional email-migration flag are false.
- Vercel build command explicitly enables only the native frontend setup flag. Rollback: set that build flag false and redeploy, or immediately disable the Hub server setup flag. Preserve database guards.
- James has the public key and requested policy confirmations and can configure his side now. Hostname confirmation, private-key provisioning and joint Pay test remain pending.
