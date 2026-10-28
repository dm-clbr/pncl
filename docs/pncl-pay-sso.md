# PNCL Hub to PNCL Pay SSO implementation brief

Updated October 28, 2026 · Partner ID: `pnclhub-h7fyl` · Status: public key and confirmations sent to James; account setup deployed and live-tested; Pay SSO disabled.

PNCL Hub initiates SSO into PNCL Pay using partner login links. This proceeds independently of LeadSpply consolidation. Keep the Hub and LeadSpply Supabase projects, identities, and credentials separate for now; database consolidation and LeadSpply session handoff are outside this integration.

All intended SSO users must use their own verified `@thepncl.com` work email. PNCL users with LeadSpply accounts must update those accounts to their PNCL work email if they currently use another address. This requirement applies to PNCL users, not unrelated standalone LeadSpply users.

James confirmed Hub can initiate the same flow and will configure the partner after receiving its RSA public key. Hub owns secure signing, authenticated link requests, and browser handoff; Pay owns partner configuration, JWT verification, account matching, link redemption, and Pay authorization.

## Public key handoff

A dedicated 3072-bit RSA keypair was generated and validated on October 26, including a successful SHA-256 sign/verify check. The public PEM is `docs/keys/pnclhub-h7fyl-public.pem`. Its SHA-256 fingerprint over SPKI DER is `61bf5ae24afd3e85a8ab6512440bfcff709f85d87ccd56038efe1e44b7eb9c92`.

The private key is retained at `.secrets/pncl-pay-sso/partner-private.pem`, inside a Git-ignored directory with mode `0700`; the key file has mode `0600`. Do not print, read into chat/LLM context, attach, or commit it. Provisioning into server-only deployment secret storage is still pending. Reuse this keypair for the public key supplied to James; do not silently generate a replacement.

The reply was sent October 28 from `vf@thepncl.com` to James (`shames0@gmail.com`), copying Bill (`bh@thepncl.com`) and DM (`dm@thepncl.com`). Gmail confirmed `SENT`, message `1a18405e373c6969`, thread `1a15f3fc818df797`. It attaches only the public PEM, confirms the required domain and deployed Hub email restriction, explains that Hub setup is rolling out, and asks James to register the partner and confirm the exact endpoint hostname. Pay stays disabled pending his configuration and the joint test. Receipt and partner registration are not yet confirmed.

## Login flow

1. A signed-in user selects PNCL Pay. Hub's backend verifies the Hub session and current account eligibility, then resolves that user's trusted work email and permanent Hub identity. Never accept the target email or user ID from the browser.
2. Generate a **fresh RS256 JWT for every outbound request**, including retries:

   | Header or claim | Required value |
   | --- | --- |
   | `alg` | `RS256` |
   | `iss` | `pnclhub-h7fyl` |
   | `aud` | `https://www.pnclplay.com/api/partner/login-links` exactly |
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

The Pay backend and Hub entry point are deployed; the Pay flags remain disabled. Each launch checks current Hub Auth/onboarding, proven LeadSpply ownership, actual matching Auth emails and approval, then uses the Hub UUID as `externalId`. RS256 tokens are fresh, 120 seconds long and use the exact documented audience; redemption is pinned to `/api/auth/partner/redeem`. Private signing material remains outside the implementation and tests. Full LeadSpply feature migration is a separate scope.

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
- [ ] **James / Vel:** Confirm public-key receipt and partner registration.
- [ ] **Hub / Vel:** Provision the existing private key into server-only deployment secret storage without exposing it in logs, chat, or tool output; record key ownership and rotation procedure.
- [ ] **James:** Register `pnclhub-h7fyl` after receiving the public key; confirm activation, allowed users, production hostname, destinations, and configured limits. Use the guide's exact `www.pnclplay.com` API/audience; his reply also mentions `pnclpay.com`, so reconcile before launch.
- [x] **Hub:** Implement and locally test session/authorization checks, trusted identity lookup, JWT signing, link requests, safe navigation, shared throttling, redacted Pay audit events and user-facing errors. Live partner testing remains pending.
- [x] **Hub:** Add the gated PNCL Pay entry point with loading, duplicate-click prevention, server-directed cooldown and recovery states. Production enablement remains off.
- [ ] **Hub + James:** Test correct-account login, unauthorized/cross-user attempts, changed/reassigned email, rejection of non-`thepncl.com` domains, migrated LeadSpply accounts, bad/expired/replayed JWTs, unsafe destinations, one-time link reuse/expiry, limits, and upstream failures. Confirm Pay permissions, existing-session/account switching, and logout/revocation expectations.
- [ ] **Vel + James:** Once partner setup and Hub tests pass, arrange the first joint video test with Vel, James Jacobson, Bill Hennen, and DM from the email thread. Scheduling follows James confirming readiness; the setup email was sent October 28.
- [ ] **Hub + James:** Record joint-test results, resolve launch blockers, and document rollback by disabling Hub SSO entry/issuance plus partner revocation when needed.

## Sources

- [James Jacobson's October 23 response, 12:43 p.m. America/Denver](https://mail.google.com/mail/u/?authuser=vf%40thepncl.com#all/1a16a13aadfbd909).
- [James's October 21 email with `partner-sso-quickstart.md`](https://mail.google.com/mail/u/?authuser=vf%40thepncl.com#all/1a160d57214e6b73): endpoint contract, lifetime, rate limit, and error codes.
- October 23 project direction: Hub initiates SSO; Hub and LeadSpply Supabase projects remain separate. On October 26, Vel specified that Hub onboarding/work email is the starting point: find and link the existing LeadSpply account from Hub, then update its email if needed. Vel confirmed that every intended SSO user must use `@thepncl.com` and that PNCL users in LeadSpply must update their account email to their PNCL work email. Deployment claims above are limited to the October 27 Hub email-lock verification; SSO and LeadSpply migration tasks remain open.
