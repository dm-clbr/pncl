# PNCL Hub to PNCL Pay SSO implementation brief

Updated November 6, 2026 · Partner ID: `pnclhub-h7fyl` · Status: dashboard SSO shortcut deployed; live automatic sign-in verified as Vel Fuimaono / vf@thepncl.com with Pay viewer access. General SSO is enabled for eligible users; the temporary test exception has been expired.

PNCL Hub initiates SSO into PNCL Pay using partner login links. This proceeds independently of LeadSpply consolidation. Keep the Hub and LeadSpply Supabase projects, identities, and credentials separate for now; database consolidation and LeadSpply session handoff are outside this integration.

All intended SSO users must use their own verified `@thepncl.com` work email. PNCL users with LeadSpply accounts must update those accounts to their PNCL work email if they currently use another address. This requirement applies to PNCL users, not unrelated standalone LeadSpply users.

James confirmed Hub can initiate the same flow and will configure the partner after receiving its RSA public key. Hub owns secure signing, authenticated link requests, and browser handoff; Pay owns partner configuration, JWT verification, account matching, link redemption, and Pay authorization.

## Public key handoff

A dedicated 3072-bit RSA keypair was generated and validated on October 26, including a successful SHA-256 sign/verify check. The public PEM is `docs/keys/pnclhub-h7fyl-public.pem`. Its SHA-256 fingerprint over SPKI DER is `61bf5ae24afd3e85a8ab6512440bfcff709f85d87ccd56038efe1e44b7eb9c92`.

The private key is retained at `.secrets/pncl-pay-sso/partner-private.pem`, inside a Git-ignored directory with mode `0700`; the key file has mode `0600`. Do not print, read into chat/LLM context, attach, or commit it. The same key was securely provisioned into Hub Edge Function secret storage on October 28; its stored digest and matching public-key fingerprint were verified without displaying private material. Reuse this keypair for the public key supplied to James; do not silently generate a replacement.

The reply was sent October 28 from `vf@thepncl.com` to James (`shames0@gmail.com`), copying Bill (`bh@thepncl.com`) and DM (`dm@thepncl.com`). Gmail confirmed `SENT`, message `1a18405e373c6969`, thread `1a15f3fc818df797`. It attaches only the public PEM, confirms the required domain and deployed Hub email restriction, explains that Hub setup is rolling out, and asks James to register the partner and confirm the exact endpoint hostname. James replied at 3:06 p.m. America/Denver that his side is ready and we may test without him (message `1a184568117e9853`). Vel then authorized correcting the hostname, provisioning the key and testing only his account before any wider enablement.

## Login flow

1. A signed-in user selects PNCL Pay. Hub's backend verifies the Hub session and current account eligibility, then resolves that user's trusted work email and permanent Hub identity. Never accept the target email or user ID from the browser.
2. Generate a **fresh RS256 JWT for every outbound request**, including retries:

   | Header or claim | Required value |
   | --- | --- |
   | `alg` | `RS256` |
   | `iss` | `pnclhub-h7fyl` |
   | `aud` | `https://www.pnclpay.com/api/partner/login-links` exactly |
   | `iat` | Current Unix time in seconds |
   | `exp` | After `iat`, at most 300 seconds later; use 120 seconds initially |
   | `jti` | New cryptographically random UUID; each token is accepted once |
   | `kid` | Required when using JWKS; identifies the signing key |

   Keep clocks synchronized; the guide permits 60 seconds of clock skew.
3. POST to that exact HTTPS endpoint with `Authorization: Bearer <JWT>`, JSON content type, and **both** `email` and `externalId`. The latter must be immutable, never reassigned, and 1–200 characters. Proposed value: the Hub Auth user UUID, with an explicit account-recreation policy. Do not substitute a LeadSpply UUID or email. Optional `returnTo` is an allowlisted Pay-relative path such as `/pay`; omission defaults to home.
4. On `201 { url, expiresAt }`, validate the HTTPS origin and documented redemption path, then immediately navigate the user's browser to the URL as a full page. The link works **once for two minutes**. Do not fetch/redeem it on the server or load Pay in an iframe.

## Security and access requirements

- Generate a dedicated **RSA keypair of at least 2048 bits** in a controlled environment and store the private key in server-only secret storage with restricted access. **Never expose, commit, paste, log, email, or send the private key into chat or LLM context.** Keep it out of browser bundles, build output, screenshots, and tool output. Do not reuse Supabase or LeadSpply secrets.
- Provide only the public PEM to James, or publish a public-only JWKS over HTTPS. For JWKS, coordinate `kid`, overlapping old/new public keys, cache behavior, and retirement with James. For PEM, coordinate replacement before switching signers. Record a rotation/revocation owner and procedure.
- Reuse Hub's server authentication helper, then explicitly check current account status and Pay eligibility. Reject expired/invalid sessions, pending or disabled accounts, unverified work emails, any email outside the exact `thepncl.com` domain, unauthorized users, and identity mismatches. Enforce the domain on the server before issuing an SSO request. Use trusted server records for identity and authorization, never user-editable metadata. Hub admin status must not grant additional Pay permissions.
- Pay currently matches by **email** and records `externalId`; supplying the ID does not make matching ID-only. Block SSO on unresolved email changes, duplicate/reassigned addresses, or identity conflicts until reconciled with Pay. Never use the editable personal recovery email as the SSO email.
- Restrict the Hub launch endpoint to authenticated POSTs and approved origins; add CSRF protection if cookies authenticate it. Validate `returnTo` against fixed relative paths, reject external/protocol-relative destinations, and use a fixed upstream host.
- Keep JWTs and redemption URLs out of logs, analytics, persistent storage, and error details. Use `Cache-Control: no-store` and a restrictive referrer policy. Audit only minimal actor ID, timestamp, outcome, and correlation ID; retain server-only secrets and ownership controls on any new records.

## Email policy and checks before launch

**Confirmed domain requirement:** All intended SSO users must have `@thepncl.com` addresses; no other email domains are eligible. James's expected domain matches this policy. The policy is confirmed; current account compliance still needs verification. The checkout enforces the domain in `src/contexts/AuthContext.tsx:33` and server-side `supabase/functions/_shared/adminAuth.ts:65`; verify the deployed rules and intended SSO roster against the same requirement.

**LeadSpply account updates:** Identify PNCL users whose LeadSpply account email differs from their verified PNCL work email. Update each existing account through a verified ownership process, preserving its user ID, data, and account links. Resolve collisions and reconcile the work email across Hub, LeadSpply, and Pay; never infer ownership from a name or merely from an email-change request. Personal recovery emails remain separate from account/login emails. Keep unresolved identities ineligible for SSO.

**Hub-native account setup deployed October 28:** The standalone verification and signup links have been replaced. Users verify an existing LeadSpply account with its current credentials and required TOTP inside Hub, then explicitly update its login to the server-derived Hub email. New users complete registration, phone verification and agreements inside Hub; existing invitation/approval requirements remain. Registration fixes the email to Hub and reserves a stable LeadSpply UUID for safe retries. Account collisions require review. Both Supabase projects remain separate.

The Pay backend and Hub entry point are deployed; general Pay enablement remains disabled; only the server-configured test user may proceed during the test window. Each launch checks current Hub Auth/onboarding, proven LeadSpply ownership, actual matching Auth emails and approval, then uses the Hub UUID as `externalId`. RS256 tokens are fresh, 120 seconds long and use the corrected Pay audience; redemption is pinned to `/api/auth/partner/redeem`. Private signing material is held in server secret storage and never enters source, test fixtures or chat. Full LeadSpply feature migration is a separate scope.

See [Hub setup implementation, tests and rollout](hub-native-account-setup.md) for API/database restrictions, native registration, throttling/error handling and remaining roster/joint-test work. The isolated LeadSpply checkout is `output/leadspply-email-migration` on `codex/pncl-email-migration`. Existing users were unchanged. Disposable hosted accounts were removed after testing, and one explicitly authorized SMS was delivered and verified. No signup notifications or test email were sent.

The earlier roster snapshot found 122 linked accounts, including 28 with non-PNCL Auth emails; these are historical counts, not a fresh compliance audit. Reconcile unlinked users and account eligibility before Pay rollout. Native setup validation now includes 49 Hub tests, 30 LeadSpply tests, 38 isolated GoTrue/database checks and 25 hosted checks including real SMS verification. Hub TypeScript and the production build pass. Existing administrator-provisioned `manual` records are accepted only with matching immutable Hub ID/current verified email; incomplete enrollment-v3 accounts remain blocked. Full real signup/approval and Pay redemption remain live-test work.

**Hub email restriction deployed October 27:** Work email remains read-only in the profile; personal recovery-email edits remain separate. Database guards on `auth.users` and `auth.identities` block user-initiated login-email changes, pending email changes, completion of old confirmation links, and provider identity email/ownership changes. Disabling email/password sign-in alone was insufficient; the restriction now covers the Auth database paths.

`admin-update-user-email` version **5** is active with JWT verification enabled. Only a currently confirmed, active full administrator with a PNCL address can prepare an exact from/to authorization through a user-authenticated RPC. It expires after 60 seconds, is checked again during the Auth transaction, and is consumed once. Duplicate/reserved emails, stale onboarding state and non-PNCL destinations fail closed; successful changes preserve the Auth UUID, update the matching onboarding record atomically and record an audit. Renames have a one-minute per-account cooldown. Browser roles cannot access the private permit/audit tables. Real Google Workspace and Pay email renames must be coordinated before the affected user's SSO is enabled.

**Verification:** 34 focused application tests, 32 isolated GoTrue API/database checks, and 22 hosted API checks passed. The isolated suite exercises real authenticated `/user` requests, real pre-existing confirmation tokens, provider identity guards and transaction rollback. Hosted tests covered anonymous/agent rejection, forged user metadata, direct Auth Admin bypass, no-send email-change link generation, valid full-admin rename, duplicate/domain validation, idempotence and cooldown. Temporary hosted accounts were deleted; no existing user's email changed. Post-deployment checks found no pending changes or remaining permits/test users, and no new security/performance advisories.

**Test limits:** Live Google/Workspace sign-in and the full Hub → Pay flow remain launch checks. Hosted self-service requests that could send confirmation mail were not issued: GoTrue can send mail before its database update fails. Those requests were tested in an isolated internal Docker network with an SMTP sink; the resulting links cannot change the account. The direct Auth API may return a generic database error; Hub's admin endpoint presents safe 400/401/403/409/429 errors. See [email-lock verification and operations](hub-email-lock-verification.md) for the test command, deployment details and recovery guidance.

## Rate limits and errors

Pay returns `application/problem+json` with `code` and `detail`. Its documented default is **60 requests per minute**; confirm the configured partner limit. Add shared per-partner and per-user throttling before signing and suppress duplicate clicks.

| Status and code | Hub handling |
| --- | --- |
| 401 `partner_auth_failed` | Stop; investigate signature, algorithm, audience, timestamps, partner setup, or reused `jti`. No automatic retry loop. |
| 404 `user_not_found` | Show an access/support message; do not retry or reveal account existence. |
| 422 `validation_failed` | Correct body or `returnTo`; do not retry unchanged input. |
| 429 `rate_limited` | Honor `Retry-After` seconds and show a cooldown; any later request needs a fresh JWT. |
| Timeout, 5xx, malformed success | Fail safely without redirect; bound retries/backoff and never reuse a JWT or cached link. |

For unexpected 401/404 responses, retain the timestamp and safe correlation details for James. Do not expose raw upstream details to users. An expired/used link requires returning to Hub for a new authenticated attempt.

## Implementation tasks

- [x] **Vel:** Confirm the domain policy: all intended SSO users must use `@thepncl.com`; PNCL users in LeadSpply must use their PNCL work email as their account email.
- [ ] **Hub / Vel:** Verify roster compliance and deployed SSO domain enforcement; settle Pay eligibility, approved work-email source, immutable ID, and coordinated rename/recreation handling. Hub email mutability is now restricted as documented above.
- [x] **Hub:** Deploy and verify backend email-change restrictions and the controlled full-admin rename path, including isolated direct self-service Auth API/confirmation tests and hosted synthetic-account checks. No external test mail or existing-user changes.
- [ ] **LeadSpply / Vel:** Identify PNCL accounts using other emails, verify their PNCL work addresses, and update existing account emails while preserving IDs, data, and links. Resolve collisions and cross-system mismatches before enabling affected users for SSO.
- [x] **LeadSpply + Hub:** Implement and locally test native ownership verification, immutable account linking, explicit email matching and new-account registration inside Hub. Preserve invitations and approvals; replace standalone signup/verification links.
- [x] **LeadSpply + Hub:** Deploy and enable native setup, and verify hosted linking/email updates/API guards/SMS.
- [ ] **LeadSpply + Hub:** Complete the separately scoped full LeadSpply feature migration into Hub.
- [ ] **LeadSpply / Vel:** Reconcile unlinked/legacy users and complete full real signup/approval/provider-login checks before SSO rollout. Targeted hosted migration tests and guard/endpoint deployment are complete.
- [x] **Hub / Vel:** Generate and verify the dedicated RSA keypair and prepare the public PEM. Private key retained locally with restricted permissions, outside version control.
- [x] **Vel:** Send the public PEM and confirmations to James, copying Bill and DM (October 28).
- [x] **James / Vel:** James replied “Ready to go” after the public-key handoff and invited independent testing (October 28).
- [x] **Hub / Vel:** Provision and verify the existing private key in server-only secret storage without exposing it. Vel/PNCL owns the key; coordinate any rotation with James before replacing it, and revoke the partner key immediately on suspected compromise.
- [x] **Hub / Vel:** Resolve the guide’s hostname typo. Use `https://www.pnclpay.com/api/partner/login-links` for the endpoint and JWT audience. The www endpoint responds with the documented authentication error; the bare host currently returns Cloudflare 525.
- [ ] **James / Vel:** Verify partner authentication end to end and confirm configured limits/destinations during live testing.
- [x] **Hub:** Implement and locally test session/authorization checks, trusted identity lookup, JWT signing, link requests, safe navigation, shared throttling, redacted Pay audit events and user-facing errors. Live partner authentication and Vel browser handoff passed November 6; provider-side replay/expiry checks remain separately documented.
- [x] **Hub:** Add the gated PNCL Pay entry point with loading, duplicate-click prevention, server-directed cooldown and recovery states. Production enablement completed November 6 after live sign-in and focused checks.
- [ ] **Hub + James:** Test correct-account login, unauthorized/cross-user attempts, changed/reassigned email, rejection of non-`thepncl.com` domains, migrated LeadSpply accounts, bad/expired/replayed JWTs, unsafe destinations, one-time link reuse/expiry, limits, and upstream failures. Confirm Pay permissions, existing-session/account switching, and logout/revocation expectations.
- [ ] **Vel + James:** Report live-test results, then coordinate any remaining joint checks with Bill and DM. James explicitly said an initial independent test is fine; no calendar invitation is scheduled.
- [ ] **Hub + James:** Record joint-test results, resolve launch blockers, and document rollback by disabling Hub SSO entry/issuance plus partner revocation when needed.

## Sources

- [James Jacobson's October 23 response, 12:43 p.m. America/Denver](https://mail.google.com/mail/u/?authuser=vf%40thepncl.com#all/1a16a13aadfbd909).
- [James's October 21 email with `partner-sso-quickstart.md`](https://mail.google.com/mail/u/?authuser=vf%40thepncl.com#all/1a160d57214e6b73): endpoint contract, lifetime, rate limit, and error codes.
- October 23 project direction: Hub initiates SSO; Hub and LeadSpply Supabase projects remain separate. On October 26, Vel specified that Hub onboarding/work email is the starting point: find and link the existing LeadSpply account from Hub, then update its email if needed. Vel confirmed that every intended SSO user must use `@thepncl.com` and that PNCL users in LeadSpply must update their account email to their PNCL work email. Deployment claims above are limited to the October 27 Hub email-lock verification; SSO and LeadSpply migration tasks remain open.

## October 28 restricted SSO test

- Deployed corrected endpoint and `payAccessEnabled` server gate in `portal-leadspply-setup`. General `PNCL_PAY_SSO_ENABLED=false`; endpoint confirmation is true and the existing matching key is provisioned.
- `PNCL_PAY_TEST_USER_ID=4946e9e3-e560-4062-9f27-117be7f3b9d7` selects only Vel’s verified `vf@thepncl.com` account. `PNCL_PAY_TEST_EXPIRES_AT=2026-10-28T23:24:53.215065+00:00` ends the window at 5:24 p.m. America/Denver. An absent, malformed or expired window denies test access. No email/role/user-metadata selection is used.
- The test exception only controls availability. It preserves current Hub identity checks, proven LeadSpply ownership, matching current emails, approval and rate limits. All other users receive Pay unavailable before the upstream call.
- Ten focused security/signing tests pass, including incorrect user IDs, expiry/missing key/endpoint, request injection, unready accounts, the exact corrected JWT audience, signature verification and unsafe links. A disposable real hosted Hub session confirmed non-allowlisted API denial (503), identity/config injection denial (400) and anonymous denial (401); sessions, user and onboarding fixture were removed and zero residue confirmed.
- Full Hub → Pay login remains pending Vel’s existing-account ownership verification in the Hub interface. Do not bypass it or claim successful Pay redemption from key provisioning or the unauthenticated endpoint probe. No new email was sent.
- Test rollback: clear `PNCL_PAY_TEST_USER_ID` or set the test expiry to the past; leave general SSO false. Full emergency stop: set `PNCL_PAY_ENDPOINT_CONFIRMED=false`. General rollout is a separate server-flag change after the live test passes.

## October 29 release and partner connection probe

- Hub commit `008b9c99` deployed successfully to production and staging. Dashboard **Your sales snapshot** and the dedicated setup page share the ownership-verification and conditional email-update modal. The current live dashboard shows the existing-link banner. Forty focused UI/snapshot/security tests passed; TypeScript and production build passed.
- After Vel explicitly requested connection feedback without a known Pay account, a controlled diagnostic sent unsigned and fresh RS256-signed requests to the exact configured www endpoint using Vel’s verified Hub email and immutable Hub UUID. OpenSSL read the existing private key directly; neither private material, signed tokens nor returned link URLs were printed or persisted.
- Unsigned request: **401 `partner_auth_failed`**, as expected. Signed request: **201**, with a login-link field. The returned link was discarded without browser redemption. This verifies endpoint reachability, partner authentication and link issuance; it does **not** verify Hub-mediated launch, final account identity, permissions, replay/expiry or logout. Initial Python HTTP probes returned 403; the working curl transport returned the documented responses above.
- Vel reports not having knowingly set up a Pay account. Link issuance alone does not establish whether Pay already has an account or provisions one later. Confirm final identity/permissions through an authorized full test and clarify provisioning behavior with James before general rollout.
- A read-only comparison of configuration hashes confirmed general Pay is still false, endpoint confirmation true, the signing configuration present, and the old October 28 test expiry unchanged. Automatic approval review blocked a proposed 30-minute production test-window renewal pending explicit scope/duration confirmation; it was not applied. The subsequently authorized one-off connection probe changed no Pay flags and created no browser session.
- Vel completed live ownership verification in Hub; the backend confirms ownership verification and an exact Hub/LeadSpply email match. A newly authorized restricted test window and browser redemption remain next steps for the full SSO test.
- At Vel's explicit request, a follow-up email was sent to James on October 29 asking how first-time Pay accounts are provisioned, what default access/approval applies, and why Vel's request returned a login link. No login link or secret was included. Vel subsequently requested draft-first review: show future email drafts and wait for approval before sending.


## November 6 launch verification

- James's October 29 reply confirms **SSO does not create Pay accounts**. Bill provisions accounts manually; absent accounts fail at login-link issuance. James confirmed Vel already has a Pay account. Vel independently confirmed with the Pay team on November 6 that its email matches Hub. [James's reply](https://mail.google.com/mail/u/?authuser=vf%40thepncl.com#all/1a189caa8e9ac457).
- Current live checks confirm Vel's Hub identity is active/confirmed, onboarding work email matches, and LeadSpply ownership, exact Auth email match and approval are complete. Both projects remain separate. Deployed Hub/LeadSpply setup source was compared with the tested checkout and matches.
- Found and fixed the normal dashboard shortcut: the CMS's direct `https://pnclpay.com` link previously bypassed SSO. Release `09a7b1c0` routes recognized Pay home/login links through protected `/portal/pay`, which automatically requests a fresh server-validated link and navigates the browser. The setup page uses the same launch route; the Pay & Commissions policy link is unchanged. Production and staging deployments succeeded November 6.
- The launch page suppresses StrictMode duplicate requests, cancels stale responses after identity changes/unmount, validates the returned Pay destination/lifetime again, and never renders or persists the link. No automatic retry loop; throttling enforces the server cooldown. Missing Pay accounts receive Bill/provisioning guidance and support rather than another login or registration prompt.
- **75 focused tests passed**: 54 backend/setup/dashboard/launch checks plus 21 Hub auth/enrollment/session-routing checks. TypeScript, targeted ESLint and production build passed; the existing bundle-size warning remains. The additional auth tests initially failed in setup because Node 26 native web storage shadowed JSDOM; rerunning with `NODE_OPTIONS=--no-experimental-webstorage` passed all 21 without source changes.
- Vel explicitly approved enabling only his immutable Hub ID for 30 minutes. General flag remained false, expiry `2026-11-06T17:16:38.958517+00:00` (10:16 a.m. Mountain), and exact scope/expiry were verified using metadata digest comparisons without exposing secrets.
- Live normal dashboard click reached Pay `/people` with no second login. The Pay profile menu identifies **Vel Fuimaono, vf@thepncl.com, Pay viewer**. Pay displays only the People navigation for this role, with access to view 55 people; no payroll/admin editing navigation was exposed. This is the existing role assigned by Pay, not a role supplied by Hub (Hub sends only email and immutable external ID). No person's pay details or financial actions were opened.
- Pay sign-out returned to the Google sign-in screen. A second normal dashboard click signed back into the same Vel / vf@thepncl.com / Pay viewer account without a second login, proving a fresh Pay session. The test Pay session was then signed out again. Hub remained signed in, as expected for separate application sessions. Signing out of Hub is not global Pay logout; emergency stopping link issuance does not revoke an already-issued Pay session. Pay session revocation remains Pay's responsibility.
- Screenshots and safe test evidence are local under `output/pay-launch-2026-11-06/`. No private key, JWT, session cookie or one-time URL is included.
- Provider-side replay/expiry enforcement, a different real Pay role/account, and cross-account Pay session switching have not been exercised live. Hub's identity-switch cancellation, invalid/expired-link rejection, non-eligible-user denial and provider error handling have automated coverage. Full new LeadSpply signup/approval and bulk roster reconciliation are separate work; per-launch eligibility checks exclude unfinished accounts.

- After the successful test, normal rollout set `PNCL_PAY_SSO_ENABLED=true` and expired the temporary test exception. Exact configuration was verified by metadata hashes. All existing per-user eligibility checks and Pay-side roles remain in force. A third live smoke test, from the setup-page button with the test exception expired, again signed in automatically as Vel / vf@thepncl.com / Pay viewer. The Pay session was signed out afterward. The live dashboard still shows Linked and Verified. No key change, account provisioning, bulk migration or email was performed.

### Rollback

Set `PNCL_PAY_SSO_ENABLED=false` and expire/clear the single-user test gate to stop new Hub SSO links. For an emergency stop regardless of either gate, set `PNCL_PAY_ENDPOINT_CONFIRMED=false`. Existing Pay sessions must be revoked in Pay. The frontend can remain deployed with the disabled-access/support message. For a frontend regression revert `09a7b1c0` through the normal release process; never restore an exposed/revoked key.


## Hub and LeadSpply shared-sign-on audit — November 6

**Finding: account linking exists; shared login sessions do not.**

- Hub uses Google OAuth into its own Supabase project and persists/refreshes that project's session. Its login return path retains `/portal/pay`, so a signed-out user first completes Hub Google sign-in and then continues through the same server checks. Pending enrollment is routed to activation.
- Hub's ordinary **Open LeadSpply** link is a plain new-tab link to `https://leadspply.com/dashboard`. It carries no auth token, code or requested identity. LeadSpply restores its own existing session, otherwise uses its own email/password sign-in. Matching email does not synchronize passwords, create a session or end another application's session.
- A live click from Vel's Hub opened an existing LeadSpply session displaying a different book/account view. That proves the shortcut does not enforce a Hub-to-LeadSpply identity switch; it does not prove an authorization breach, because LeadSpply already had that session/view. No logout, impersonation, dialer or account change was performed in LeadSpply; its separate active release was left untouched.
- LeadSpply's current main `PnclConnect` page generates a 10-minute **ownership code** and links back to Hub's `/portal/leadspply` page. It does not exchange a session into Hub. The older instruction to paste that code in Hub is now stale: current Hub uses the native credential/TOTP verification modal. That LeadSpply UI should be updated in its own isolated release; no unreviewed changes were made to its busy checkout.
- The native Hub ownership check signs into LeadSpply server-side with the entered credentials, requires enrolled TOTP, records ownership, then signs out that temporary session. LeadSpply tokens never reach Hub's browser. Ownership remains valid for ordinary Pay eligibility; the 10-minute proof lifetime applies to a new email change, not recurring Pay access. Each Pay launch still rechecks current linked-account status, exact email and approval.
- Pay cannot use a LeadSpply browser identity, preview/impersonation identity or connection code to choose its user. It requires an independently authenticated Hub session; the backend obtains the current Hub email/UUID and validates the linked LeadSpply account. The successful Vel Pay tests ran while the separate LeadSpply browser session existed, and Pay still reached Vel's exact Hub identity.
- Logout/expiry are independent: LeadSpply refreshes its project session and its normal logout is local to that application/browser; Hub uses its own Auth sign-out; Pay has its own session/sign-out. There is no federated logout or shared refresh-token system. Expired or invalid Hub authentication is rejected before Pay issuance; unresolved setup remains ineligible.
- This audit used current GitHub main auth/connection sources, deployed Hub/setup sources and a live shortcut observation. The main LeadSpply checkout contains unrelated VA/tracker work and was inspected read-only. Genuine automatic Hub ↔ LeadSpply SSO is a new integration feature, not completed by the Pay launch, and requires a separately agreed trust/session-handoff design while keeping both projects separate.

Plain-language journey: sign into Hub with your PNCL Google email; verify/link LeadSpply once and align its email; click PNCL Pay for automatic Pay sign-in. Opening LeadSpply currently uses its own login session. Coming from LeadSpply still requires a valid Hub session before Pay can open.


### Draft update to James — not sent

Hi James,

Hub-to-Pay SSO is now working end to end. Clicking PNCL Pay from the normal Hub dashboard signed me in without another login. We confirmed vf@thepncl.com and the existing Pay viewer role, then signed out and repeated successfully from a fresh Pay session.

We corrected the dashboard shortcut to use the secure handoff and enabled SSO only through Hub's existing verified-email, account-link and approval checks. Users without a Pay account now see guidance to have Bill provision it, as you confirmed.

We have not live-tested provider-side JWT replay/expiry, reused/expired login links, or switching between two different Pay accounts. Could we arrange a short joint check of those cases and confirm the intended session-revocation behavior? No secrets or login links are included here.

Thanks,
Vel

## Hub → LeadSpply single sign-on — November 6, 2026

Implementation is prepared on `codex/hub-leadspply-sso` in an isolated checkout. Deployment and live pilot are pending. This is one-way Hub → LeadSpply; projects, databases, normal LeadSpply sign-in, roles, subscriptions and approvals stay separate.

The normal Hub Open LeadSpply action enters `/portal/leadspply/open`. A brief automatic round trip to `https://leadspply.com/pncl-sso.html` creates a five-minute browser transaction; only its SHA-256 challenge is sent to Hub. The backend derives the immutable Hub UUID and verified work email from the authenticated session/onboarding record, then sends a fresh RS256 JWT with exact issuer/audience, 120-second lifetime, UUID jti and signed request-body digest. The LeadSpply server checks the current Hub export, permanent UUID link, ownership evidence after the latest link, matching confirmed Auth email, absence of pending email changes, and current approval/deactivation/suspension. Browser identity, role and redirect overrides are rejected.

LeadSpply stores only a random handoff token's hash, its browser challenge, canonical identity and two-minute expiry. A unique jti rejects replay; atomic ticket consumption permits one winner under simultaneous requests. Browser redemption needs both the opaque link token and the verifier retained in that browser tab. The standalone handoff page removes the token fragment immediately, loads no application/analytics UI, and sends no credentials in a URL. Fixed destination, no-store/no-referrer responses, restricted CORS and CSP prevent redirect/cache/referrer leaks.

GoTrue generates and exchanges an existing-account magiclink server-side, without email. UUID/email are checked before generation, in its result, in the resulting session and before delivery. A private Auth INSERT guard prevents magiclink auto-creation if the existing account disappears during that window. It briefly reserves only recent SSO destination emails; it does not modify existing users. Verified TOTP is required before an AAL2 session is delivered; no AAL1 session is exposed for an enrolled account. A failed or unsupported factor fails closed, and temporary failed sessions are revoked. Current eligibility and factors are rechecked before delivery. No Hub role is copied to LeadSpply.

A valid existing LeadSpply session for the same linked account is reused. A different account or impersonation identity is preserved and blocked with instructions to finish any call/work and sign out normally first. The handoff never silently logs another account out. Final auth storage writes also reject a racing different identity. An active shared or tab-local impersonation return snapshot blocks SSO until the user exits it normally; the handoff preserves that return session. The destination clears only stale snapshot remnants and its active-book preference before entering the normal dashboard; fresh sign-in cannot erase an unsynced offline queue/draft. Existing route/role/subscription gates still apply. Session refresh and logout are ordinary LeadSpply operations, independent of Hub and Pay; this is not federated logout.

### Configuration and rollout

- Dedicated signing key: Hub-only `PNCL_LEADSPPLY_PRIVATE_KEY_PEM`; matching public-only `PNCL_LEADSPPLY_PUBLIC_KEY_PEM` on LeadSpply. Its service-only `pncl_sso_config` RPC reads the private receiver settings table when an explicit environment setting is absent; ordinary accounts and the runtime service cannot change those operator settings. Do not reuse or change the Pay key. Never print, commit, log or put private material into chat or a browser bundle.
- Both projects require `PNCL_LEADSPPLY_SSO_ENABLED=true` for general rollout. A separate immutable `PNCL_LEADSPPLY_TEST_USER_ID` plus valid future `PNCL_LEADSPPLY_TEST_EXPIRES_AT` can opt one user into a short pilot. Pay flags do not grant LeadSpply access. A missing/expired gate fails closed.
- Apply `20261106171642_pncl_hub_sso_handoffs.sql` and `20261106175145_pncl_sso_server_settings.sql` to LeadSpply; deploy `pncl-hub-sso` there and `portal-leadspply-sso` to Hub. These handlers authenticate internally (`verify_jwt=false`): RS256 for partner issuance, browser-bound one-time proof for redemption, independently verified Hub JWT for the proxy. Existing integration-key export validation remains server-only.
- LeadSpply publishes the separate `pncl-sso.html` Vite entry with its Vercel security headers; Hub publishes the protected launch route and rewired shortcuts. Deploy with gates off, then test the exact authorized account, only enable generally after the live result supports it.
- Rate limits: partner issuance 60/minute, per Hub user 10/10 minutes; redemption 300/minute global and 6 attempts/ticket per 2 minutes. Database counters are shared across instances. Invalid/expired/replayed links require a new launch; bad MFA consumes the ticket. No automatic retries. 429 responses include Retry-After; errors expose only allowlisted codes. Audit logs include random correlation ID/outcome (Hub also actor UUID), never token, URL, key, TOTP, full request or native Auth error.
- Rollback: set the general flag false and expire/clear both test gates; either project can stop new SSO. Existing LeadSpply sessions require normal LeadSpply revocation. Keep the harmless private tables/guard during rollback; the guard's reservation ages out after ten minutes beyond ticket expiry. Revert frontend commits through the normal release process if needed.

### Validation before pilot

57 isolated real PostgreSQL/GoTrue checks passed: ownership, approval/lifecycle/email rejection, browser-role denial, private RLS/grants, operator-only receiver settings, jti replay, browser proof, eight concurrent redeems yielding one success, expiry/relinking, durable limits, native one-use token, exact UUID, refresh/logout, real TOTP/AAL2 refresh, zero external email, and deletion-race prevention of account creation. `python3 scripts/run-pncl-sso-tests.py` creates disposable services on an internal Docker network and removes them afterward. It never needs production credentials.

Focused signing/service/browser-flow tests, existing logout regression checks, Hub launch/security/dashboard tests, targeted lint, both builds and TypeScript checks passed. LeadSpply's existing lint/typecheck ratchets remain in place; no new baseline debt was accepted. Live browser account identity/permissions and production deployment are still required before claiming SSO launched.
