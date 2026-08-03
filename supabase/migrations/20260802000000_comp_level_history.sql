-- Preserve the effective date of every compensation-tier assignment.  The
-- current tier remains on portal_profiles for existing callers; this table is
-- the immutable audit trail used by hierarchy and exports.
create table if not exists public.portal_profile_comp_level_history (
  id uuid primary key default gen_random_uuid(),
  -- Intentionally no foreign key: history survives deletion of an Auth user.
  user_id uuid not null,
  comp_level smallint,
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint portal_profile_comp_level_history_level_check
    check (comp_level is null or (comp_level between 70 and 145 and (comp_level - 70) % 5 = 0))
);

create index if not exists portal_profile_comp_level_history_current_idx
  on public.portal_profile_comp_level_history (user_id, effective_at desc);

alter table public.portal_profile_comp_level_history enable row level security;

-- Seed current tiers once for existing agents. Historical effective dates do
-- not exist for legacy profiles, so record the migration observation time
-- rather than misrepresenting profile.updated_at as a tier-change date.
-- Re-running this migration is safe and does not duplicate a current value.
insert into public.portal_profile_comp_level_history (user_id, comp_level, effective_at)
select p.user_id, p.comp_level, now()
from public.portal_profiles p
where p.comp_level is not null
  and not exists (
    select 1 from public.portal_profile_comp_level_history h
    where h.user_id = p.user_id and h.comp_level is not distinct from p.comp_level
  );

create or replace function public.track_portal_profile_comp_level()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.comp_level is not null then
      insert into public.portal_profile_comp_level_history (user_id, comp_level)
      values (new.user_id, new.comp_level);
    end if;
  elsif new.comp_level is distinct from old.comp_level and new.comp_level is not null then
    insert into public.portal_profile_comp_level_history (user_id, comp_level)
    values (new.user_id, new.comp_level);
  end if;
  return new;
end;
$$;

drop trigger if exists portal_profiles_comp_level_history on public.portal_profiles;
create trigger portal_profiles_comp_level_history
after insert or update of comp_level on public.portal_profiles
for each row execute function public.track_portal_profile_comp_level();
