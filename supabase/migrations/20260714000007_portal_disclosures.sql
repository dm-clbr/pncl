-- Genesis disclosure modules (videos 1-7) move into PNCL Hub: agents watch
-- each module and acknowledge compliance. Video URLs are filled in when
-- Genesis provides them; modules stay acknowledgeable in the meantime.
create table if not exists portal_disclosures (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  video_url text,
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists portal_disclosures_updated_at on portal_disclosures;
create trigger portal_disclosures_updated_at
before update on portal_disclosures
for each row
execute function public.set_updated_at();

create table if not exists portal_disclosure_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  disclosure_id uuid not null references portal_disclosures (id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  unique (user_id, disclosure_id)
);

create index if not exists portal_disclosure_acknowledgments_user_id_idx
  on portal_disclosure_acknowledgments (user_id);

alter table portal_disclosures enable row level security;
alter table portal_disclosure_acknowledgments enable row level security;

drop policy if exists "Authenticated users can view published disclosures" on portal_disclosures;
create policy "Authenticated users can view published disclosures"
  on portal_disclosures
  for select
  to authenticated
  using (published);

drop policy if exists "Users can view own disclosure acknowledgments" on portal_disclosure_acknowledgments;
create policy "Users can view own disclosure acknowledgments"
  on portal_disclosure_acknowledgments
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can add own disclosure acknowledgments" on portal_disclosure_acknowledgments;
create policy "Users can add own disclosure acknowledgments"
  on portal_disclosure_acknowledgments
  for insert
  to authenticated
  with check (user_id = auth.uid());

insert into portal_disclosures (slug, title, description, sort_order)
values
  ('disclosure_1', 'Disclosure 1', 'Watch the module, then confirm you understand and will comply.', 1),
  ('disclosure_2', 'Disclosure 2', 'Watch the module, then confirm you understand and will comply.', 2),
  ('disclosure_3', 'Disclosure 3', 'Watch the module, then confirm you understand and will comply.', 3),
  ('disclosure_4', 'Disclosure 4', 'Watch the module, then confirm you understand and will comply.', 4),
  ('disclosure_5', 'Disclosure 5', 'Watch the module, then confirm you understand and will comply.', 5),
  ('disclosure_6', 'Disclosure 6', 'Watch the module, then confirm you understand and will comply.', 6),
  ('disclosure_7', 'Disclosure 7', 'Watch the module, then confirm you understand and will comply.', 7)
on conflict (slug) do nothing;

-- Point the existing checklist item at the in-hub disclosures page and let it
-- auto-complete once every published module is acknowledged.
update portal_todos
set
  href = '/portal/disclosures',
  external = false,
  action_label = 'Watch & agree',
  description = 'Watch each short disclosure module and agree that you will comply with all state and national regulations.',
  completion_type = 'auto',
  auto_key = 'disclosures',
  updated_at = now()
where slug = 'disclosures';
