# PNCL Hub — Security Summary

Prepared for the security review with Colin. Covers how PNCL Hub (Vite + React frontend, Supabase backend) handles authentication, sensitive data, storage, and the Google Workspace integration.

## Architecture at a glance

- **Frontend:** Single-page React app (Vite) hosted on Vercel. Talks to Supabase over HTTPS using the public anon key plus each user's JWT.
- **Backend:** Supabase — Postgres, Auth, Storage, and Deno Edge Functions. All privileged operations run in edge functions with the service-role key, which never leaves the server.
- **Email:** Resend for transactional email (welcome, notifications). No secrets in email bodies except one-time temporary passwords for account activation.

## Authentication and authorization

- **Supabase Auth** manages all logins. Portal accounts use `@thepncl.com` emails; agents can also sign in with Google OAuth against their Workspace account.
- **Roles** live in `auth.users.app_metadata.role` (`admin`, `genesis_admin`, or agent by default). App metadata is only writable with the service-role key — users cannot elevate themselves.
- **Route guards:** the React app gates `/portal/*` behind a session and `/portal/admin/*` behind the admin roles, but the real enforcement is server-side: every admin edge function calls `requireAdmin` / `requireGenesisAdminOrAdmin`, which verifies the caller's JWT and role before touching data. Agent-facing functions call `requirePortalUser`.
- **JWT verification** is enabled (`verify_jwt = true`) for every edge function in `supabase/config.toml` except the public onboarding endpoints (`submit-onboarding`, `get-onboarding-status`, etc.), which are token-gated (see below).

## Onboarding flow security

- Onboarding is pre-auth, so access is controlled by a random **handoff token**: 32 random bytes, base64url-encoded, stored only as a SHA-256 hash, compared in constant time.
- **Temporary passwords** generated for new accounts are AES-256-GCM encrypted at rest (`CREDENTIAL_ENCRYPTION_KEY` secret) and revealed once through a token-gated endpoint.
- **SSNs** collected during onboarding are never stored in plaintext: only an HMAC-SHA-256 hash (keyed by the encryption secret) is kept for dedup checks. The full SSN goes into the signed W-9 PDF only.

## Sensitive data at rest

| Data | Table | Protection |
| --- | --- | --- |
| SSN / TIN | `portal_w9_forms`, `onboarding_records` | HMAC hash only; full value only inside the generated W-9 PDF in a private bucket |
| Bank account + routing | `portal_direct_deposit_forms` | AES-256-GCM encrypted columns; decrypted only inside service-role edge functions |
| Carrier portal passwords | `portal_carrier_credentials` | AES-256-GCM encrypted; decrypted per-request for the owning agent |
| Temporary account passwords | `onboarding_records` | AES-256-GCM encrypted; one-time reveal |
| Signed PDFs (ICA, W-9, direct deposit, comp attachments) | Storage | Private buckets, short-lived signed URLs (1 h) |
| Driver's license, E&O certificate, agent uploads | Storage `portal-profile-documents` | Private bucket, per-user folder RLS |

The encryption key (`CREDENTIAL_ENCRYPTION_KEY`) is a Supabase secret available only to edge functions.

## Database access control (RLS)

- Every table is either **RLS-enabled with owner-scoped policies** (e.g. `portal_profiles`, `portal_profile_documents`, `portal_disclosure_acknowledgments` — users can only read/write rows where `user_id = auth.uid()`), or **RLS-enabled with no policies**, meaning it is reachable only through service-role edge functions (e.g. `onboarding_records`, `portal_w9_forms`, `portal_direct_deposit_forms`, `portal_ica_signatures`, `portal_comp_attachments`, `lead_charges`).
- Admin reads/writes never rely on client-side table access; they go through `admin-*` edge functions that re-verify the admin role on every call.

## Storage security

- All document buckets are **private**. Public bucket only for profile photos.
- Object policies scope agents to their own folder: `(storage.foldername(name))[1] = auth.uid()`.
- Admin downloads use server-generated signed URLs with 1-hour expiry; nothing is ever exposed as a permanent public URL.
- Buckets enforce file-size limits (5 MB) and allowed MIME types (PDF/JPEG/PNG/WebP).

## Google Workspace integration

- Edge functions use a **service account** with domain-wide delegation, restricted to the Admin SDK Directory scopes needed to create users, set recovery info, and check account status.
- The service-account JSON lives in Supabase secrets (never in the client bundle). The example file in the repo (`google-service-account.json.example`) contains placeholders only.
- Account lifecycle: portal account deletion does **not** silently delete the Google account; admins manage Workspace accounts explicitly, and suspension status is surfaced read-only in the admin console.

## Signing flows (no third-party e-sign)

- ICA, W-9, direct deposit, and comp attachments are signed in-app with `pdf-lib`. Each signature record stores the typed legal name, timestamp, IP address, and user agent for auditability, and the stamped PDF is stored in a private bucket.

## Known follow-ups / discussion topics for the review

1. **Rate limiting** on the public onboarding endpoints (currently protected by token secrecy; Supabase-level rate limits could be added).
2. **Key rotation** procedure for `CREDENTIAL_ENCRYPTION_KEY` (rotation requires re-encrypting stored credentials).
3. **Audit logging** — admin actions are logged via structured function logs (`logOnboarding`); a durable audit table for admin profile edits is planned alongside the admin-edit feature.
4. **Session policy** — Supabase default JWT lifetime; confirm whether shorter sessions or refresh-token rotation is desired for admins.
5. **`google-service-account.json` hygiene** — confirm the real credentials file is git-ignored everywhere and only present in deployment secrets.
