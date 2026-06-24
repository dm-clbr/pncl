alter table portal_profiles
  add column if not exists comp_level smallint;

alter table portal_profiles
  drop constraint if exists portal_profiles_comp_level_check;

alter table portal_profiles
  add constraint portal_profiles_comp_level_check
  check (
    comp_level is null
    or (comp_level between 70 and 140 and (comp_level - 70) % 5 = 0)
  );

create table if not exists portal_referral_invites (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users (id) on delete cascade,
  comp_level smallint not null,
  recipient_label text,
  status text not null default 'pending',
  consumed_at timestamptz,
  consumed_by_onboarding_id uuid references onboarding_records (id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint portal_referral_invites_comp_level_check
    check (comp_level between 70 and 140 and (comp_level - 70) % 5 = 0),
  constraint portal_referral_invites_status_check
    check (status in ('pending', 'consumed', 'expired', 'revoked'))
);

create index if not exists portal_referral_invites_referrer_created_idx
  on portal_referral_invites (referrer_user_id, created_at desc);

create index if not exists portal_referral_invites_status_expires_idx
  on portal_referral_invites (status, expires_at);

alter table onboarding_records
  add column if not exists referral_invite_id uuid references portal_referral_invites (id) on delete set null,
  add column if not exists invited_comp_level smallint,
  add column if not exists ssn_hash text;

create unique index if not exists onboarding_records_ssn_hash_active_idx
  on onboarding_records (ssn_hash)
  where status not in ('failed', 'expired')
    and ssn_hash is not null;

alter table portal_referral_invites enable row level security;

drop policy if exists "Users can read own referral invites" on portal_referral_invites;
create policy "Users can read own referral invites"
  on portal_referral_invites
  for select
  to authenticated
  using (auth.uid() = referrer_user_id);
