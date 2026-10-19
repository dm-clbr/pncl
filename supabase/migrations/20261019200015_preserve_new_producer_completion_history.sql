-- Snapshot pre-ticket completion once. Agents cannot add or edit these records,
-- so future user-metadata edits cannot bypass the new submission endpoint.
create table if not exists public.portal_new_producer_legacy_completions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  recorded_at timestamptz not null default now()
);
alter table public.portal_new_producer_legacy_completions enable row level security;
revoke all on public.portal_new_producer_legacy_completions from public, anon, authenticated, service_role;
grant select on public.portal_new_producer_legacy_completions to service_role;

insert into public.portal_new_producer_legacy_completions(user_id)
select u.id from auth.users u
left join public.portal_profiles p on p.user_id = u.id
where u.raw_user_meta_data->'completed_portal_todos'->>'submit_new_producer' = 'true'
  or p.new_producer_notification_sent_at is not null
on conflict (user_id) do nothing;

comment on table public.portal_new_producer_legacy_completions is
  'Read-only snapshot of New Producer completions accepted before ticket-based onboarding. Recorded at rollout, not the original submission time.';
