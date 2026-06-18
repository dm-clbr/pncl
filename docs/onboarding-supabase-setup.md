# PNCL Onboarding — Supabase Edge Functions Setup

## Already done in this project

These steps were completed locally:

- [x] Supabase project linked (`dpnajpojbxgsckwrmvnm`)
- [x] Database migrations pushed (`onboarding_records` table)
- [x] Edge Functions deployed:
  - `submit-onboarding`
  - `get-onboarding-status`
  - `reveal-onboarding-credentials`
- [x] Frontend env in `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)

**You still need to do:** Google domain-wide delegation, save service account JSON, set Supabase secrets (steps 2–5 below), then test.

Full guide: [Supabase Dashboard → Functions](https://supabase.com/dashboard/project/dpnajpojbxgsckwrmvnm/functions)

---

Complete the remaining steps in order. Commands assume you are in the project root:

```bash
cd /Users/vel/Documents/Aveyo/PNCL
```

---

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) installed (`brew install supabase/tap/supabase`)
- [jq](https://jqlang.github.io/jq/) installed (`brew install jq`)
- Logged into Supabase: `supabase login`
- Google service account JSON file saved locally (see step 3)
- Domain-wide delegation configured in Google Workspace Admin (see step 2)

---

## Step 1 — Frontend env (already mostly done)

Your `.env.local` should contain:

```env
VITE_SUPABASE_URL=https://dpnajpojbxgsckwrmvnm.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

Get the anon key from: [Supabase Dashboard → PNCL db → Settings → API](https://supabase.com/dashboard/project/dpnajpojbxgsckwrmvnm/settings/api)

Restart the dev server after changing env:

```bash
npm run dev
```

---

## Step 2 — Google Workspace (one-time, in Google Admin)

1. Open [Google Workspace Admin](https://admin.google.com) → **Security** → **Access and data control** → **API controls** → **Domain-wide delegation**
2. Click **Add new** and enter:
   - **Client ID:** `101589819016618734344`
   - **OAuth scopes:**
     ```
     https://www.googleapis.com/auth/admin.directory.user
     ```
   - For group assignment (optional), also add:
     ```
     https://www.googleapis.com/auth/admin.directory.group,https://www.googleapis.com/auth/admin.directory.group.member
     ```
3. Confirm **Admin SDK** is enabled for your domain.
4. Confirm org unit **`/Agents`** exists (Admin → Directory → Organizational units), or ask to change the code default.
5. Optional: create Google Groups `agents@thepncl.com`, `training@thepncl.com` if you want auto group assignment.

**Security:** If you pasted the service account private key anywhere public, rotate the key in [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts?project=employee-onboarding-499721) before production.

---

## Step 3 — Save Google service account JSON locally

Save your downloaded key as a **gitignored** file in the project root:

```bash
# Example path (do not commit this file)
./google-service-account.json
```

The file should look like:

```json
{
  "type": "service_account",
  "client_email": "onboarding-service-account@employee-onboarding-499721.iam.gserviceaccount.com",
  "client_id": "101589819016618734344",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
}
```

---

## Step 4 — Link Supabase project

```bash
supabase login
supabase link --project-ref dpnajpojbxgsckwrmvnm
```

When prompted for database password, use the password from Supabase Dashboard → Settings → Database.

---

## Step 5 — Set Edge Function secrets

Generate an encryption key (save this somewhere secure — if you lose it, encrypted SSN/passwords in DB cannot be decrypted):

```bash
export CREDENTIAL_ENCRYPTION_KEY="$(openssl rand -base64 32)"
echo "$CREDENTIAL_ENCRYPTION_KEY"   # copy to a password manager
```

Run the setup script:

```bash
chmod +x scripts/setup-onboarding-secrets.sh
./scripts/setup-onboarding-secrets.sh ./google-service-account.json
```

This sets on Supabase:

| Secret | Value |
|--------|--------|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | from JSON `client_email` |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | from JSON `private_key` |
| `GOOGLE_SERVICE_ACCOUNT_CLIENT_ID` | from JSON `client_id` |
| `GOOGLE_WORKSPACE_ADMIN_EMAIL` | `dm@thepncl.com` |
| `GOOGLE_WORKSPACE_CUSTOMER_ID` | `my_customer` |
| `PNCL_EMAIL_DOMAIN` | `thepncl.com` |
| `CREDENTIAL_ENCRYPTION_KEY` | your generated key |

Verify secrets (names only):

```bash
supabase secrets list
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically into Edge Functions at runtime.

---

## Step 6 — Run database migration

Creates the `onboarding_records` table:

```bash
supabase db push --yes
```

Or use the combined deploy script (step 7).

Confirm in Dashboard → **Table Editor** that `onboarding_records` exists.

> **Note:** Migrations were already applied to `dpnajpojbxgsckwrmvnm`. Re-run only if setting up a new project.

---

## Step 7 — Deploy Edge Functions

```bash
chmod +x scripts/deploy-onboarding.sh
./scripts/deploy-onboarding.sh
```

Or:

```bash
npm run onboarding:deploy
```

> **Note:** Functions are already deployed. Re-run after code changes.

Or manually:

```bash
supabase functions deploy submit-onboarding get-onboarding-status reveal-onboarding-credentials
```

Deployed endpoints:

| Function | URL |
|----------|-----|
| Submit | `https://dpnajpojbxgsckwrmvnm.supabase.co/functions/v1/submit-onboarding` |
| Status | `https://dpnajpojbxgsckwrmvnm.supabase.co/functions/v1/get-onboarding-status` |
| Reveal | `https://dpnajpojbxgsckwrmvnm.supabase.co/functions/v1/reveal-onboarding-credentials` |

---

## Step 8 — Test locally

```bash
npm run dev
```

1. Open http://localhost:8080/onboarding
2. Complete the agent onboarding form
3. You should land on `/onboarding/success/:id?token=...`
4. Wait for **Creating your PNCL email…** → **Your PNCL email is ready**
5. Click **Reveal Sign-In Instructions** → **Open Gmail**

---

## Step 9 — Verify in Supabase Dashboard

After a test submission, check:

- **Table Editor → `onboarding_records`** — row with `status = ready`, `workspace_email` populated
- **Edge Functions → Logs** — no Google auth errors

---

## Troubleshooting

| Symptom | Likely fix |
|--------|------------|
| `Supabase is not configured` in browser | Set `VITE_SUPABASE_*` in `.env.local`, restart dev server |
| `Missing Google service account private key` | Run step 5 secrets script |
| `Unable to authenticate with Google Workspace` | Check domain-wide delegation (step 2), admin email `dm@thepncl.com` is super admin |
| `Google Workspace user creation failed` | Confirm `/Agents` org unit exists; check Edge Function logs for API error |
| `Unable to create onboarding record` | Run `supabase db push` (step 6) |
| CORS / 401 on functions | Anon key in `.env.local` must match project; functions have `verify_jwt = false` |

---

## Quick checklist

- [ ] Google domain-wide delegation added
- [ ] `google-service-account.json` saved locally (not committed)
- [ ] `CREDENTIAL_ENCRYPTION_KEY` generated and stored securely
- [ ] `./scripts/setup-onboarding-secrets.sh` run successfully
- [ ] `supabase db push` completed
- [ ] Edge Functions deployed
- [ ] Test submission creates `@thepncl.com` user in Google Admin → Users
