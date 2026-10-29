# Hub account setup and Pay SSO

Implemented October 27; production rollout October 28, 2026. Both server endpoints and LeadSpply guards are deployed, native setup flags are enabled, and the frontend is live at https://www.thepncl.com/portal/leadspply. Hosted checks and a real SMS verification passed. General Pay SSO remains false. The corrected endpoint is confirmed and the existing signing key is provisioned; an expiring server gate permits only Vel’s Hub account to test. See [restricted test status](pncl-pay-sso.md#october-28-restricted-sso-test). James's public-key reply was sent (`SENT`, message `1a18405e373c6969`, original thread `1a15f3fc818df797`) with the original recipients and only the 625-byte public PEM attachment.

## User flow

PNCL Hub → LeadSpply is the account setup entry point. A current verified `@thepncl.com` Hub Auth email must match a completed, unreleased onboarding record, or an administrator-provisioned legacy `manual` record. Incomplete enrollment-v3 accounts cannot use the legacy path.

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
- A PNCL account cannot self-edit `platform_approved_at` or `setter_status` through the profile API. The deployed database trigger closes this observed production permission gap, while preserving existing non-self admin/upline approval paths. Review historical eligibility during roster reconciliation.
- A new account receives only allowlisted metadata. Rep accounts remain pending manual approval; setters retain the existing invite and approval path. Arbitrary staff/admin invitation or hierarchy metadata is rejected.
- Pay uses the current Hub email and immutable Hub UUID as `externalId`. Fresh RS256 JWTs have a 120-second lifetime and unique UUID `jti`, issuer `pnclhub-h7fyl`, and exact audience `https://www.pnclpay.com/api/partner/login-links`.
- Successful links must match the documented HTTPS origin and `/api/auth/partner/redeem` path, contain exactly one token parameter, and be unexpired with a bounded two-minute lifetime. Browser navigation is full-page. The backend never opens or caches the link.
- Runtime signing accepts a server-only PKCS#8 RSA key of at least 2048 bits. The existing dedicated 3072-bit key was securely provisioned on October 28 without displaying it; the remote digest and matching public fingerprint were verified. Never place it in source, frontend variables, logs, chat or email. Only the public PEM was attached to James's sent reply.
- Requests and responses use no-store. Error details are allowlisted; passwords, OTPs, keys, JWTs and redemption URLs are never logged. Pay audit events contain only Hub UUID, request UUID, UTC timestamp and outcome.
- A controlled Hub rename may temporarily create mismatches. Pay fails closed until LeadSpply and Pay reconciliation is complete. Recreated Hub accounts get new UUIDs; do not reuse IDs or automatically transfer old links.

## Limits and errors

Shared database limits apply before signing, and a per-Hub transport limit (45/minute) runs before the roster export. Status is limited to 30/minute; credential verification to 6 per Hub/10 minutes and 10 per hashed target email/10 minutes. Phone sends are limited to 3 per hashed number/10 minutes, with additional per-Hub and verification-attempt limits. Other mutations/Pay have per-Hub limits; partner Pay issuance is capped at 50/minute, below James's documented default 60/minute. These are initial conservative limits, not an assertion of James's configured limit.

Rate-limited responses expose a bounded `Retry-After`; Hub disables further attempts during the cooldown. No automatic credential, email-change or Pay retry loop exists. Timeouts after mutations instruct users to refresh status; reservations prevent duplicate registration on retry. Email-change permits expire/cancel precisely.

401 credentials/MFA, 400 form/phone validation, 409 ownership/conflict/approval and 429 limits have safe user messages. Pay 401/configuration and unexpected responses fail closed; 404 requires account setup/support; 422 requires configuration review. Raw provider details are not returned. Any new Pay attempt signs a new JWT.

## Verification

- Hub: **49 focused tests passed** across UI, proxy, signing and email-source/lock suites; production TypeScript and build passed (existing large-bundle warning).
- LeadSpply: **30 focused tests passed**, including native service, email helper, portal HTTP and email notice regressions. Type-error ratchet passed with 58 existing errors against its 99-error baseline; no new file errors. Both new Edge Functions passed Deno type checks.
- `python3 scripts/run-hub-native-setup-tests.py`: **38 checks** against real GoTrue v2.197.0 and Postgres in a disposable internal Docker network with a local SMTP sink. Tests include immutable IDs, direct Auth API and identity guard rejection, one-time permits, old/new login emails, duplicate links/NPN/phone, proof expiry, private permissions, registration retry identity and actual TOTP enrollment/verification. App tables/profile creation are minimal fixtures; this is not a clone of the complete production approval/notification system.
- Local Twilio and Pay calls are mocked; JWT signatures are verified with ephemeral in-memory test keys. No production RSA private key is loaded into tests. Real partner replay, link redemption, Pay permissions and provider/session switching remain live-test work; James permits independent initial testing.
- Browser review uses the actual Hub components with synthetic accounts and local service fixtures. It confirms existing-account verification → explicit email update → matching status → disabled Pay pending configuration. Native registration fields and embedded agreements are rendered inside Hub. Preview files/screenshots are in `output/hub-setup-review/`.
- The October 27 isolated tests sent no external messages. October 28 hosted tests used three disposable identities, preserved existing users, and sent one user-authorized SMS; the supplied code verified successfully. No signup alerts or approval texts were generated. Test sessions were revoked, then users, profiles, onboarding rows, links, proof/phone state, permits and scoped rate buckets were removed. One synthetic email-change audit remains.
- **25 hosted checks passed**: real cross-project status, ownership/password verification, exact Hub-email update, preserved UUID/password, old-login rejection, cross-user/actor override denial, protected approvals/service RPCs, required phone proof, rejected caller-selected registration email, legacy manual-record compatibility, Pay-off checks before/after readiness, and real SMS send/verification. Hub password login remains disabled; synthetic sessions used unsent Admin-generated login links.
- Production browser verification confirmed the released screen and disabled Pay button using the existing authenticated Hub account without changing it. Screenshot: `output/hub-live-setup/account-setup-live.png`. A fresh reload was needed for the PWA to load the release.
- Full real new-account creation/approval and provider-MFA flows were not exercised in production; creation, retry and TOTP have isolated coverage. At the initial setup rollout, Pay requests/redemption were never enabled or sent. The later restricted test gate is documented separately above.

## Rollout and remaining work

1. **Complete:** targeted LeadSpply migrations, both setup endpoints, current Hub export, and frontend deployment. The shared integration and Twilio configuration were verified through live requests. Both setup flags are true; the old transitional email-migration flag is false.
2. **Complete:** controlled hosted linking/email-update/security checks, live browser review, real SMS send/verification with the user's permission, and disposable-data cleanup. Administrator-provisioned legacy accounts are supported with regression coverage.
3. **Remaining:** reconcile the intended SSO roster and review approval eligibility. Coordinate a full new signup/approval test before claiming that complete lifecycle has been exercised live. No bulk account migration was performed.
4. **Complete:** public PEM/policies sent; James reports ready. Vel confirmed the corrected Pay domain; a live unauthenticated probe confirms the www Pay endpoint serves the expected API.
5. **Complete:** existing private key securely provisioned and endpoint flag true. `PNCL_PAY_SSO_ENABLED=false`; only the immutable test-user ID has expiring access, with all eligibility checks intact.
6. Complete Vel’s LeadSpply ownership verification in Hub, then test Hub → Pay. James says we can test independently; coordinate any remaining joint checks afterward. No calendar invitation is scheduled. Test correct identity, cross-user denial, changed email, replay/expiry, permission boundaries, logout and account switching before Pay rollout.

Rollback: disable the native frontend/server setup flags to stop new setup mutations; disable Pay issuance separately. Preserve the database email guards and existing links/audit history. For compromised signing material, disable issuance and have James revoke the partner key.

## October 28 deployment record

- LeadSpply email migration: hosted version `20261028194132`. Native setup migration was applied in two equivalent batches after the connector returned expired-request errors for the full request: `20261028195239_pncl_hub_native_setup_state` and `20261028195247_pncl_hub_native_setup_guards`. The local October 27 file contains their combined SQL. Do not push the entire migration history.
- LeadSpply `pncl-hub-setup` v1 is active. Hub `portal-leadspply-setup` and `export-leadspply-reps` are deployed. Setup flags are true in both projects; Hub Pay/endpoint flags and the old transitional email-migration flag are false.
- Vercel build command explicitly enables only the native frontend setup flag. Rollback: set that build flag false and redeploy, or immediately disable the Hub server setup flag. Preserve database guards.
- Initial rollout record above predates the restricted SSO test preparation. James subsequently reported ready, the hostname was corrected and the key provisioned. General SSO remains disabled; live Pay redemption remains pending.

Post-deployment security advisors report the expected five private RLS tables without browser policies; their grants are revoked. No new warning/error finding identifies these setup functions. Unrelated agency RPC warnings appeared concurrently and were not changed by this rollout. LeadSpply’s dashboard also displays an existing over-quota warning with potential restrictions from November 1; billing was not changed.

## October 29 dashboard and setup-page update

The dashboard’s **Your sales snapshot** now uses the same `HubAccountSetup` controller and modal as the account setup page. Unlinked users can verify and link in one action, or create an account inside Hub. Existing links without the newer ownership proof show a banner explaining that their connection and sales data remain intact; **Verify link once** opens the ownership check. Proof is recorded by the existing backend, never inferred from an old link.

After successful verification, a matching email finishes the flow. Any mismatch, including a different `@thepncl.com` address, advances the same modal to **Use your PNCL Hub email**. It displays both addresses and requires **Update to my Hub email** before changing anything. **Finish later** preserves the verified link; an expired proof requires a new check before the sensitive email update. The completed verification banner disappears, and account changes refresh the sales snapshot.

The authenticator input appears only if the server requires it. Passwords and codes clear after submission or dismissal. The modal keeps focus during step changes and does not reopen after a dismissed in-flight request. The native account creation form retains phone verification and all required agreements.

Validation: 30 focused UI/snapshot tests and 10 signing/security tests passed; TypeScript and production build passed with the existing bundle-size warning. Local browser review uses synthetic accounts only. Preview scenarios cover existing links, mismatched emails, unlinked accounts and completed verification. Vel approved deploying both shared surfaces on October 29; hosted verification follows the release. This UI release changes no backend keys, account records or Pay flags. General Pay remains off; the October 28 test exception has expired. Vel reports no existing Pay account, so a signed partner connection probe can validate authentication/account lookup but cannot establish successful login.
