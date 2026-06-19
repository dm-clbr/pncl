# PNCL Employee Portal — Email/Password Auth Setup

The employee portal uses **Supabase email/password authentication** — not Google OAuth.

Portal accounts are provisioned automatically when the `@thepncl.com` Google Workspace email is created during onboarding.

---

## Onboarding → Portal flow

1. Agent submits onboarding form
2. `@thepncl.com` Google Workspace email is created
3. **Automatically:** Supabase portal account is created and an **activation email** is sent to the PNCL inbox
4. Agent reveals Gmail sign-in details on the success page (parallel — no button gate)
5. Agent signs into Gmail and sets Google password on their own time
6. Agent opens the **portal activation email** → lands on `/onboarding/activate`
7. Agent creates portal password → automatically signed in → redirected to `/portal`

---

## Supabase configuration

### 1. Enable email confirmations

1. Open [Supabase → Authentication → Providers → Email](https://supabase.com/dashboard/project/dpnajpojbxgsckwrmvnm/auth/providers)
2. Ensure **Email** provider is enabled
3. Turn **Confirm email** ON
4. Save

### 2. URL configuration

1. Open [Authentication → URL Configuration](https://supabase.com/dashboard/project/dpnajpojbxgsckwrmvnm/auth/url-configuration)
2. **Site URL:** `http://localhost:8080` (dev) or your production URL
3. **Redirect URLs:**
   ```
   http://localhost:8080/onboarding/activate
   http://localhost:8080/portal
   http://localhost:8080/**
   ```
4. Save

### 3. Edge Function secret

Set `PNCL_SITE_URL` so activation emails link to the correct host:

```bash
supabase secrets set PNCL_SITE_URL=http://localhost:8080
# Production: PNCL_SITE_URL=https://your-domain.com
```

### 4. Email delivery (Resend)

All emails are sent through **Resend** — no Supabase SMTP required.

| Email type | Where it runs | Env var |
|------------|---------------|---------|
| Lead form notifications | Vercel `api/submit.ts` | `RESEND_API_KEY` on Vercel |
| Portal activation invites | Supabase Edge Functions | `RESEND_API_KEY` as Supabase secret |

Set the Supabase secret (use the same Resend API key as Vercel):

```bash
supabase secrets set RESEND_API_KEY=re_your_key_here
```

Optional overrides:

```bash
supabase secrets set PNCL_FROM_EMAIL=no-reply@thepncl.com PNCL_FROM_NAME=PNCL
```

Ensure **`thepncl.com`** is verified in [Resend → Domains](https://resend.com/domains).

Activation emails are sent via `generateLink` + Resend immediately after Google Workspace email creation.

---

## Edge functions

| Function | Purpose |
|----------|---------|
| `submit-onboarding` | Creates Google user + provisions portal account + sends activation email |
| `setup-portal-account` | Resends portal activation email (from success page) |

Deploy with:

```bash
./scripts/deploy-onboarding.sh
```

---

## Test locally

1. Set `PNCL_SITE_URL=http://localhost:8080` in Supabase secrets
2. `npm run dev` → http://localhost:8080/onboarding
3. Complete onboarding — portal activation email sent automatically
4. Reveal Gmail credentials on success page
5. Open activation email in PNCL inbox → `/onboarding/activate`
6. Set portal password → lands on `/portal`

---

## Troubleshooting

| Symptom | Likely fix |
|---------|------------|
| No activation email received | Set `RESEND_API_KEY` Supabase secret; verify `thepncl.com` in Resend; check spam; use **Resend portal activation email** on success page |
| Activation link goes to wrong URL | Set `PNCL_SITE_URL` secret to match your app host |
| "Invalid or expired" on activate page | Resend activation email; open the latest link |
| Portal login says email not confirmed | Complete activation via email link first |
| Gmail works but no portal email | Check `submit-onboarding` logs for `portal_invite_failed` |

---

## Quick checklist

- [ ] Supabase Email provider enabled
- [ ] Confirm email turned ON
- [ ] Redirect URLs include `/onboarding/activate`
- [ ] `PNCL_SITE_URL` secret set
- [ ] `submit-onboarding` and `setup-portal-account` deployed
- [ ] `RESEND_API_KEY` set on Vercel (lead forms) and Supabase (portal activation)
- [ ] `thepncl.com` verified in Resend
- [ ] Full onboarding flow tested end-to-end
