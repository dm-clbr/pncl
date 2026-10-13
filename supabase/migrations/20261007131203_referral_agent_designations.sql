-- Existing invite links retain the current LOA onboarding.
alter table public.portal_referral_invites
  add column agent_designation text not null default 'loa'
  check (agent_designation in ('loa', 'ibo'));

-- Persist a trusted snapshot for delayed provisioning and retries.
alter table public.onboarding_records
  add column invited_agent_designation text not null default 'loa'
  check (invited_agent_designation in ('loa', 'ibo'));

-- Only authenticated Edge Functions using the service role create/claim links.
-- Preserve the existing owner SELECT policy and grants.
revoke insert, update, delete on table public.portal_referral_invites from anon, authenticated;
