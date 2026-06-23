alter table portal_dashboard_sections
  drop constraint if exists portal_dashboard_sections_section_type_check;

alter table portal_dashboard_sections
  add constraint portal_dashboard_sections_section_type_check
  check (section_type in ('links', 'incentives', 'brand_assets', 'downloads'));

create table if not exists portal_dashboard_files (
  id uuid primary key default gen_random_uuid(),
  section_id text not null references portal_dashboard_sections (id) on delete cascade,
  title text not null,
  description text,
  url text not null,
  file_name text not null,
  content_type text not null,
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_dashboard_files_section_sort_idx
  on portal_dashboard_files (section_id, sort_order asc, created_at asc);

alter table portal_dashboard_files enable row level security;

drop policy if exists "Authenticated users can read published dashboard files" on portal_dashboard_files;
create policy "Authenticated users can read published dashboard files"
  on portal_dashboard_files
  for select
  to authenticated
  using (published = true);

drop trigger if exists portal_dashboard_files_updated_at on portal_dashboard_files;
create trigger portal_dashboard_files_updated_at
before update on portal_dashboard_files
for each row
execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portal-dashboard-files',
  'portal-dashboard-files',
  true,
  26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/x-zip-compressed',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read portal dashboard files" on storage.objects;
create policy "Public read portal dashboard files"
  on storage.objects
  for select
  to public
  using (bucket_id = 'portal-dashboard-files');
