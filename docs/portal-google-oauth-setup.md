# PNCL Employee Portal — Google OAuth Setup

Step-by-step guide to enable **Sign in with Google** for the PNCL Employee Portal (`/portal`).

This is **separate** from the Google **service account** used to create `@thepncl.com` emails during agent onboarding. Portal login needs its own **OAuth 2.0 Web Client**.

| Credential | Purpose |
|------------|---------|
| Service account JSON (`google-service-account.json`) | Create `@thepncl.com` Workspace users (onboarding) |
| OAuth 2.0 Web Client ID + Secret (this guide) | Portal “Sign in with Google” via Supabase Auth |

---

## Project references

| Item | Value |
|------|--------|
| Supabase project | `dpnajpojbxgsckwrmvnm` |
| Supabase Auth callback URL | `https://dpnajpojbxgsckwrmvnm.supabase.co/auth/v1/callback` |
| Google Cloud project (onboarding) | `employee-onboarding-499721` |
| Allowed email domain | `@thepncl.com` |
| Local dev app URL | `http://localhost:8080` |
| Portal route after login | `http://localhost:8080/portal` |

**Supabase dashboard links:**

- [Authentication → Providers → Google](https://supabase.com/dashboard/project/dpnajpojbxgsckwrmvnm/auth/providers)
- [Authentication → URL Configuration](https://supabase.com/dashboard/project/dpnajpojbxgsckwrmvnm/auth/url-configuration)

**Google Cloud links:**

- [Credentials (employee-onboarding project)](https://console.cloud.google.com/apis/credentials?project=employee-onboarding-499721)
- [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent?project=employee-onboarding-499721)

---

## Prerequisites

- Access to Google Cloud project `employee-onboarding-499721` (or create OAuth credentials in another GCP project you control)
- Access to Supabase project `dpnajpojbxgsckwrmvnm` as an admin
- PNCL app running locally: `npm run dev` → http://localhost:8080
- `.env.local` contains `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

---

## Step 1 — Configure OAuth consent screen

Do this **before** creating the OAuth client if Google prompts you.

1. Open [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent?project=employee-onboarding-499721)
2. Choose user type:
   - **Internal** — recommended if only `@thepncl.com` Workspace users should sign in
   - **External** — use if Internal is not available; you can restrict to thepncl.com later
3. Fill required fields:
   - **App name:** `PNCL Employee Portal`
   - **User support email:** your admin email (e.g. `dm@thepncl.com`)
   - **Developer contact email:** same or your dev email
4. **Scopes** — add at minimum:
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
5. Save and continue through any test-user / summary steps until the consent screen is published (Internal apps are auto-available to your org).

---

## Step 2 — Create OAuth 2.0 Web Client ID

1. Open [Credentials](https://console.cloud.google.com/apis/credentials?project=employee-onboarding-499721)
2. Click **+ Create credentials** → **OAuth client ID**
3. **Application type:** `Web application`
4. **Name:** `PNCL Supabase Portal Auth` (or similar)
5. **Authorized JavaScript origins** — optional for Supabase-hosted callback, but add for local dev:
   ```
   http://localhost:8080
   ```
   Add production origin when deployed, e.g.:
   ```
   https://thepncl.com
   ```
6. **Authorized redirect URIs** — **required**. Add exactly:
   ```
   https://dpnajpojbxgsckwrmvnm.supabase.co/auth/v1/callback
   ```
   Copy this from Supabase → Authentication → Providers → Google → **Callback URL**.
7. Click **Create**
8. Copy and save:
   - **Client ID** — ends with `.apps.googleusercontent.com`
   - **Client secret** — starts with `GOCSPX-`

> **Do not** use the service account `client_id` from `google-service-account.json` (numeric ID like `101589819016618734344`). That is for Workspace Admin API, not portal OAuth.

---

## Step 3 — Enable Google provider in Supabase

1. Open [Supabase → Authentication → Providers → Google](https://supabase.com/dashboard/project/dpnajpojbxgsckwrmvnm/auth/providers)
2. Toggle **Enable Sign in with Google** → **ON**
3. **Client IDs** — paste the Web Client ID from Step 2:
   ```
   xxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
   ```
   Must end with `.apps.googleusercontent.com`. If Supabase shows “Invalid characters”, the value is wrong.
4. **Client Secret (for OAuth)** — paste the `GOCSPX-...` secret from Step 2
5. Leave **Skip nonce checks** OFF unless you have a specific mobile/iOS need
6. Leave **Allow users without an email** OFF
7. Click **Save**

---

## Step 4 — Configure Supabase redirect URLs

Supabase must allow redirecting back to your app after Google auth.

1. Open [Authentication → URL Configuration](https://supabase.com/dashboard/project/dpnajpojbxgsckwrmvnm/auth/url-configuration)
2. Set **Site URL** (local dev):
   ```
   http://localhost:8080
   ```
3. Under **Redirect URLs**, add:
   ```
   http://localhost:8080/portal
   http://localhost:8080/**
   ```
4. When you deploy production, also add:
   ```
   https://your-production-domain.com/portal
   https://your-production-domain.com/**
   ```
5. Save

---

## Step 5 — Test portal login locally

1. Start the app:
   ```bash
   npm run dev
   ```
2. Open http://localhost:8080/portal/login
3. Click **Sign in with Google**
4. Sign in with a `@thepncl.com` account (e.g. one created via onboarding)
5. You should be redirected to http://localhost:8080/portal and see the **Employee Portal** dashboard

**App enforcement:** The portal only accepts `@thepncl.com` emails (`AuthContext` + Google `hd=thepncl.com` hint). Other domains are signed out automatically.

---

## Step 6 — Test full onboarding → portal flow

1. Open http://localhost:8080/onboarding
2. Complete the form and submit
3. On success page: **Reveal Sign-In Instructions**
4. **Open Gmail** → sign in with temporary password → set permanent password
5. Click **I've signed into Gmail — Enter Portal**
6. Complete Google OAuth with the same `@thepncl.com` account
7. Land on `/portal` logged in

---

## Troubleshooting

| Symptom | Likely fix |
|---------|------------|
| Supabase: “Invalid characters” on Client IDs | Use OAuth Web Client ID (`....apps.googleusercontent.com`), not service account ID or project name |
| `redirect_uri_mismatch` from Google | Add `https://dpnajpojbxgsckwrmvnm.supabase.co/auth/v1/callback` to Google OAuth **Authorized redirect URIs** |
| Redirected to Supabase but not back to app | Add `http://localhost:8080/portal` to Supabase **Redirect URLs** |
| “Only @thepncl.com accounts can access…” | Sign in with a Workspace `@thepncl.com` account, not a personal Gmail |
| Google: “Access blocked” / consent screen | Publish OAuth consent screen; for External apps, add test users or verify app |
| Portal button does nothing | Confirm Google provider is **enabled** and saved in Supabase |
| `Invalid client` | Client ID and secret mismatch — re-copy from Google Cloud Credentials |

---

## Security notes

- **Never commit** OAuth client secrets or service account private keys to git
- Rotate the OAuth client secret in Google Cloud if it was pasted into chat or shared publicly
- The service account JSON (`google-service-account.json`) remains for **email provisioning only** — do not reuse it for Supabase Google Sign-In
- Production: use **Internal** OAuth consent where possible so only your Google Workspace org can authenticate

---

## Quick checklist

- [ ] OAuth consent screen configured (Internal or External)
- [ ] OAuth 2.0 **Web application** client created
- [ ] Redirect URI `https://dpnajpojbxgsckwrmvnm.supabase.co/auth/v1/callback` added in Google Cloud
- [ ] Client ID + Secret pasted into Supabase Google provider
- [ ] **Enable Sign in with Google** turned ON and saved (no validation errors)
- [ ] Supabase Site URL = `http://localhost:8080`
- [ ] Supabase Redirect URLs include `http://localhost:8080/portal`
- [ ] Test: `/portal/login` → Google → `/portal` dashboard
