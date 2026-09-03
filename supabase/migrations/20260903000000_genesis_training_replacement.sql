-- Replace the external Genesis curriculum with seven PNCL-hosted training
-- modules and bind each acknowledgment to the exact content version watched.
alter table public.portal_disclosures
  add column if not exists content_version integer not null default 1;

alter table public.portal_disclosure_acknowledgments
  add column if not exists content_version integer not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'portal_disclosures_content_version_positive'
      and conrelid = 'public.portal_disclosures'::regclass
  ) then
    alter table public.portal_disclosures
      add constraint portal_disclosures_content_version_positive
      check (content_version > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'portal_disclosure_acknowledgments_content_version_positive'
      and conrelid = 'public.portal_disclosure_acknowledgments'::regclass
  ) then
    alter table public.portal_disclosure_acknowledgments
      add constraint portal_disclosure_acknowledgments_content_version_positive
      check (content_version > 0);
  end if;
end
$$;

alter table public.portal_disclosure_acknowledgments
  drop constraint if exists portal_disclosure_acknowledgments_user_id_disclosure_id_key;

alter table public.portal_disclosure_acknowledgments
  drop constraint if exists portal_disclosure_acknowledgments_user_disclosure_version_key;

alter table public.portal_disclosure_acknowledgments
  add constraint portal_disclosure_acknowledgments_user_disclosure_version_key
  unique (user_id, disclosure_id, content_version);

create or replace function public.set_portal_disclosure_content_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if row(new.title, new.description, new.video_url, new.published)
    is distinct from row(old.title, old.description, old.video_url, old.published) then
    new.content_version := old.content_version + 1;
  else
    new.content_version := old.content_version;
  end if;

  return new;
end;
$$;

drop trigger if exists portal_disclosures_content_version on public.portal_disclosures;
create trigger portal_disclosures_content_version
before update on public.portal_disclosures
for each row
execute function public.set_portal_disclosure_content_version();

with training_modules (slug, title, description, video_url, sort_order) as (
  values
    (
      'disclosure_1',
      'Day 1: Welcome',
      'Start here for an introduction to PNCL, the training path, and what to expect as you launch.',
      'https://www.youtube.com/watch?v=pd2a8WCC8cs',
      1
    ),
    (
      'disclosure_2',
      'Day 1: Welcome — Part 2',
      'Continue the Day 1 welcome and learn the foundational expectations for getting started with PNCL.',
      'https://www.youtube.com/watch?v=9iQnVo4tibQ',
      2
    ),
    (
      'disclosure_3',
      'Day 2: Script Training — Part 1',
      'Learn the first part of the PNCL sales script and the core conversation structure.',
      'https://www.youtube.com/watch?v=MMC9vlQRIrw',
      3
    ),
    (
      'disclosure_4',
      'Day 3: Applications — Part 1',
      'Learn the first part of the PNCL application process and how to prepare a complete submission.',
      'https://www.youtube.com/watch?v=q63_noNkDe0',
      4
    ),
    (
      'disclosure_5',
      'Day 3: Applications — Part 2',
      'Continue the PNCL application training with the remaining submission workflow.',
      'https://www.youtube.com/watch?v=LMGcZqNqhnY',
      5
    ),
    (
      'disclosure_6',
      'Day 4: Underwriting & Financial Inventory',
      'Learn PNCL underwriting fundamentals and how to complete a client financial inventory.',
      'https://www.youtube.com/watch?v=IF_sfLKysKg',
      6
    ),
    (
      'disclosure_7',
      'Day 5: Getting Paid & Launching Your Business',
      'Review compensation essentials and the steps for launching your PNCL business.',
      'https://www.youtube.com/watch?v=x8gPJ16U6SM',
      7
    )
)
update public.portal_disclosures as disclosure
set
  title = module.title,
  description = module.description,
  video_url = module.video_url,
  sort_order = module.sort_order,
  published = true,
  updated_at = now()
from training_modules as module
where disclosure.slug = module.slug;

-- Grandfather existing acknowledgments into this initial training rollout so
-- agents who already completed all seven modules do not lose that progress.
-- Later content edits still increment the disclosure version and require a new
-- acknowledgment because this backfill runs only once during this migration.
update public.portal_disclosure_acknowledgments as acknowledgment
set content_version = disclosure.content_version
from public.portal_disclosures as disclosure
where acknowledgment.disclosure_id = disclosure.id
  and acknowledgment.content_version <> disclosure.content_version;

drop policy if exists "Users can add own disclosure acknowledgments"
  on public.portal_disclosure_acknowledgments;
drop policy if exists "Users can add own ready disclosure acknowledgments"
  on public.portal_disclosure_acknowledgments;
create policy "Users can add own ready disclosure acknowledgments"
  on public.portal_disclosure_acknowledgments
  for insert
  to authenticated
  with check (
    portal_disclosure_acknowledgments.user_id = (select auth.uid())
    and exists (
      select 1
      from public.portal_disclosures as disclosure
      where disclosure.id = portal_disclosure_acknowledgments.disclosure_id
        and disclosure.published
        and nullif(btrim(disclosure.video_url), '') is not null
        and disclosure.content_version = portal_disclosure_acknowledgments.content_version
    )
  );

update public.portal_todos
set
  title = 'Complete PNCL training',
  description = 'Watch all seven PNCL training modules and confirm each one when complete.',
  href = '/portal/disclosures',
  external = false,
  action_label = 'Start training',
  completion_type = 'auto',
  auto_key = 'disclosures',
  updated_at = now()
where slug = 'disclosures';

-- Convert the existing dashboard entry so agents retain a permanent training
-- destination after the external Genesis experience is retired.
update public.portal_dashboard_links
set
  title = 'PNCL Training',
  description = 'Complete the PNCL onboarding training curriculum.',
  href = '/portal/disclosures',
  external = false,
  published = true,
  updated_at = now()
where href = 'https://www.pinnaclegenesis.cc/'
   or lower(title) = 'pinnacle genesis';

insert into public.portal_dashboard_links (
  section_id,
  title,
  description,
  href,
  external,
  icon,
  sort_order,
  published
)
select
  'training',
  'PNCL Training',
  'Complete the PNCL onboarding training curriculum.',
  '/portal/disclosures',
  false,
  'GraduationCap',
  1,
  true
where not exists (
  select 1
  from public.portal_dashboard_links
  where href = '/portal/disclosures'
);
