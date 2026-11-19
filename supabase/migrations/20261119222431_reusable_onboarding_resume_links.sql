-- Server-only encrypted copy lets admins re-copy the same unexpired handoff.
-- Existing RLS has no client policies; token validation still uses the SHA-256 hash.
alter table public.onboarding_records
  add column if not exists handoff_token_encrypted text;
comment on column public.onboarding_records.handoff_token_encrypted is
  'AES-GCM encrypted active handoff token. Server-only; never include in admin list or public status responses.';
