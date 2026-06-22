create table if not exists portal_dashboard_sections (
  id text primary key,
  title text not null,
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_dashboard_links (
  id uuid primary key default gen_random_uuid(),
  section_id text not null references portal_dashboard_sections (id) on delete cascade,
  title text not null,
  description text,
  href text not null,
  external boolean not null default false,
  icon text not null default 'Link2',
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_dashboard_sections_sort_order_idx
  on portal_dashboard_sections (sort_order asc, created_at asc);

create index if not exists portal_dashboard_links_section_sort_idx
  on portal_dashboard_links (section_id, sort_order asc, created_at asc);

alter table portal_dashboard_sections enable row level security;
alter table portal_dashboard_links enable row level security;

create policy "Authenticated users can read published dashboard sections"
  on portal_dashboard_sections
  for select
  to authenticated
  using (published = true);

create policy "Authenticated users can read published dashboard links"
  on portal_dashboard_links
  for select
  to authenticated
  using (published = true);

drop trigger if exists portal_dashboard_sections_updated_at on portal_dashboard_sections;
create trigger portal_dashboard_sections_updated_at
before update on portal_dashboard_sections
for each row
execute function public.set_updated_at();

drop trigger if exists portal_dashboard_links_updated_at on portal_dashboard_links;
create trigger portal_dashboard_links_updated_at
before update on portal_dashboard_links
for each row
execute function public.set_updated_at();

insert into portal_dashboard_sections (id, title, sort_order, published)
values
  ('sales-tools', 'Sales Tools', 0, true),
  ('training', 'Training & Resources', 1, true),
  ('account', 'Account', 2, true),
  ('pncl', 'PNCL', 3, true)
on conflict (id) do update set
  title = excluded.title,
  sort_order = excluded.sort_order,
  published = excluded.published;

insert into portal_dashboard_links (section_id, title, description, href, external, icon, sort_order, published)
select * from (values
  ('sales-tools', 'LeadSpply', 'Leads, quotes, and client management.', 'https://leadspply.com/register', true, 'BarChart3', 0, true),
  ('sales-tools', 'Gmail', 'Your @thepncl.com email inbox.', 'https://mail.google.com', true, 'Mail', 1, true),
  ('sales-tools', 'Carrier Sheet', 'Carrier contacts and e-app links.', '/portal/carriers', false, 'Building2', 2, true),
  ('sales-tools', 'Client Intake', 'Financial inventory script and Pinnacle form.', '/portal/clients/new', false, 'ClipboardList', 3, true),
  ('sales-tools', 'My Clients', 'View clients you have submitted intake forms for.', '/portal/clients', false, 'UserRound', 4, true),
  ('sales-tools', 'Discord', 'PNCL community server for announcements, training, and support.', 'https://discord.gg/aHqQDtTmp', true, 'MessageCircle', 5, true),
  ('training', 'Pinnacle Genesis', 'Agent training platform and curriculum.', 'https://www.pinnaclegenesis.cc/', true, 'GraduationCap', 0, true),
  ('account', 'My Profile', 'Update your name, sizes, and profile photo.', '/portal/profile', false, 'User', 0, true),
  ('pncl', 'Company Website', 'Public PNCL site and product pages.', '/', false, 'Globe', 0, true)
) as seed(section_id, title, description, href, external, icon, sort_order, published)
where not exists (
  select 1 from portal_dashboard_links
  where section_id = seed.section_id and title = seed.title and href = seed.href
);
